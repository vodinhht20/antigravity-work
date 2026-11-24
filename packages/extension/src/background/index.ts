import {
  Attachment, AuditEntry, BridgeStatus, DEFAULT_CONNECTION, MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH, MAX_REPLY_LENGTH, ModelOption, NATIVE_HOST_NAME, PanelMessage,
  PROTOCOL_VERSION, SavedConversation, WorkerMessage,
} from "../shared/protocol";
import { captureTab, executeBrowserTool, isSameDocument, redactText, summarizeTab } from "./browser_tools";

type StagedContext = { attachment: Attachment; documentId: string; pageUrl: string };
type Panel = { port: chrome.runtime.Port; windowId: number | null; attachments: Map<string, StagedContext> };
type Request = { id: string; panel: Panel; sent: boolean; length: number; agentMode: boolean };
type NativeMessage = { id?: string; type?: string; payload?: Record<string, unknown> };

const panels = new Set<Panel>();
const requests = new Map<string, Request>();
const pendingPrefills = new Map<number, { text: string; expires: number }>();
let nativePort: chrome.runtime.Port | null = null;
let bridgeStatus: BridgeStatus = { phase: "connecting" };
let availableModels: ModelOption[] = [];
let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let storageQueue: Promise<void> = Promise.resolve();

// Route the toolbar click through the action event so Chrome grants activeTab.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn("Gecko for Antigravity could not reset its context menu.");
      return;
    }
    chrome.contextMenus.create({
      id: "ask-gecko-antigravity",
      title: "Hỏi Gecko for Antigravity",
      contexts: ["page", "selection"],
      documentUrlPatterns: ["https://*/*", "http://*/*"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "ask-gecko-antigravity" || tab?.windowId === undefined) return;
  const selected = info.selectionText?.trim().slice(0, 2000);
  const text = selected
    ? `Giải thích / hỗ trợ nội dung sau:\n\n"${selected}"`
    : "Tóm tắt nội dung trang này thành các ý chính.";
  const windowId = tab.windowId;
  for (const [id, entry] of pendingPrefills) {
    if (entry.expires < Date.now()) pendingPrefills.delete(id);
  }
  pendingPrefills.set(windowId, { text, expires: Date.now() + 30000 });
  void chrome.sidePanel.open({ windowId }).catch(() => pendingPrefills.delete(windowId));
  for (const panel of panels) {
    if (panel.windowId === windowId) {
      post(panel, { type: "context.prefill", text });
      pendingPrefills.delete(windowId);
    }
  }
});

function post(panel: Panel, message: WorkerMessage): void {
  if (!panels.has(panel)) return;
  try {
    panel.port.postMessage(message);
  } catch {
    detachPanel(panel);
  }
}

function updateStatus(status: BridgeStatus) {
  bridgeStatus = status;
  for (const panel of panels) post(panel, { type: "bridge.status", status });
}

function enqueueStorage(action: () => Promise<void>): Promise<void> {
  const result = storageQueue.then(action);
  storageQueue = result.catch(() => {});
  return result;
}

function recordActivity(action: AuditEntry["action"], count: number): void {
  if (!count) return;
  void enqueueStorage(async () => {
    const { activity } = await chrome.storage.local.get("activity");
    const entries = Array.isArray(activity) ? activity : [];
    const entry: AuditEntry = { id: crypto.randomUUID(), timestamp: Date.now(), action, count };
    await chrome.storage.local.set({ activity: [entry, ...entries].slice(0, 60) });
  }).catch(() => {});
}

function endRequest(request: Request, code?: string) {
  if (requests.get(request.id) !== request) return;
  requests.delete(request.id);
  post(request.panel, code
    ? { type: "chat.error", id: request.id, code }
    : { type: "chat.done", id: request.id });
}

function sendNative(message: object): boolean {
  if (!nativePort) return false;
  try {
    nativePort.postMessage(message);
    return true;
  } catch {
    stopNative("DISCONNECTED", true);
    return false;
  }
}

function stopNative(code?: string, retry = false) {
  clearTimeout(handshakeTimer);
  clearTimeout(retryTimer);
  const port = nativePort;
  nativePort = null;
  port?.disconnect();
  for (const request of requests.values()) endRequest(request, code ?? "DISCONNECTED");
  updateStatus(code ? { phase: "error", code } : { phase: "connecting" });
  if (retry && panels.size && retries < 3) {
    const delay = 1000 * 2 ** retries;
    retries += 1;
    retryTimer = setTimeout(connectNative, delay);
  }
}

function onNativeMessage(raw: NativeMessage) {
  if (raw === null || typeof raw !== "object") return;
  const { type, id, payload } = raw;
  if (type === "hello.result") {
    clearTimeout(handshakeTimer);
    if (payload?.protocol !== PROTOCOL_VERSION) {
      stopNative("HOST_INCOMPATIBLE");
      return;
    }
    if (payload.code) {
      stopNative(String(payload.code));
      return;
    }
    if (payload.backend !== "cli" && payload.backend !== "sdk") {
      stopNative("HOST_INCOMPATIBLE");
      return;
    }
    retries = 0;
    updateStatus({ phase: "ready", backend: payload.backend, version: String(payload.version ?? "") });
    return;
  }

  if (type === "models.list" && Array.isArray(payload?.models)) {
    availableModels = payload.models
      .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object" && typeof (m as Record<string, unknown>).id === "string")
      .map((m) => ({ id: String(m.id), label: typeof m.label === "string" && m.label ? m.label : String(m.id) }));
    for (const panel of panels) post(panel, { type: "models.list", models: availableModels });
    return;
  }

  // Remote Antigravity IDE/CLI MCP arm call
  if (type === "tool.call" && typeof id === "string" && id.startsWith("remote-")
      && typeof payload?.callId === "string" && typeof payload?.name === "string") {
    const callId = payload.callId;
    const toolName = payload.name;
    const toolArgs = (payload.args && typeof payload.args === "object" ? payload.args : {}) as Record<string, unknown>;
    const notifyPanels = (status: "running" | "done" | "error", detail?: string) => {
      for (const panel of panels) post(panel, { type: "remote.tool", name: toolName, status, detail });
    };
    notifyPanels("running");
    void (async () => {
      const openPanel = [...panels].find((p) => p.windowId !== null);
      let windowId = openPanel?.windowId ?? null;
      if (windowId === null) {
        try {
          const focused = await chrome.windows.getLastFocused();
          windowId = focused.id ?? null;
        } catch {
          windowId = null;
        }
      }
      if (windowId === null) {
        notifyPanels("error", "Không tìm thấy cửa sổ Chrome đang hoạt động.");
        sendNative({ id, type: "tool.result", payload: { callId, ok: false, error: "No active Chrome window found." } });
        return;
      }
      const result = await executeBrowserTool(windowId, toolName, toolArgs);
      const ok = result.ok === true;
      notifyPanels(ok ? "done" : "error", typeof result.error === "string" ? result.error : undefined);
      sendNative({ id, type: "tool.result", payload: { callId, ...result } });
    })();
    return;
  }

  const request = id ? requests.get(id) : undefined;
  if (!request?.sent) return;
  if (type === "tool.call" && request.agentMode && typeof payload?.callId === "string" && typeof payload?.name === "string") {
    const callId = payload.callId;
    const toolName = payload.name;
    const toolArgs = (payload.args && typeof payload.args === "object" ? payload.args : {}) as Record<string, unknown>;
    const windowId = request.panel.windowId;
    if (windowId === null) {
      sendNative({ id: request.id, type: "tool.result", payload: { callId, ok: false, error: "Side panel không gắn với cửa sổ nào." } });
      return;
    }
    post(request.panel, { type: "chat.tool", id: request.id, name: toolName, status: "running" });
    void executeBrowserTool(windowId, toolName, toolArgs).then((result) => {
      if (requests.get(request.id) !== request) return;
      const ok = result.ok === true;
      post(request.panel, {
        type: "chat.tool",
        id: request.id,
        name: toolName,
        status: ok ? "done" : "error",
        detail: typeof result.error === "string" ? result.error : undefined,
      });
      sendNative({ id: request.id, type: "tool.result", payload: { callId, ...result } });
    });
    return;
  }
  if (type === "chat.delta" && typeof payload?.text === "string") {
    const text = payload.text.slice(0, MAX_REPLY_LENGTH - request.length);
    if (text) {
      request.length += text.length;
      post(request.panel, { type: "chat.delta", id: request.id, text });
    }
  } else if (type === "chat.done") {
    endRequest(request);
  } else if (type === "error") {
    endRequest(request, typeof payload?.code === "string" ? payload.code : "BACKEND_ERROR");
  }
}

function connectNative() {
  if (nativePort || !panels.size) return;
  updateStatus({ phase: "connecting" });

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort = port;
    port.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message ?? "";
      if (nativePort !== port) return;
      const code = /not found|not registered/i.test(reason) ? "HOST_MISSING"
        : /forbidden|not allowed|access/i.test(reason) ? "HOST_FORBIDDEN" : "DISCONNECTED";
      stopNative(code, code === "DISCONNECTED");
    });
    port.onMessage.addListener((raw) => {
      if (port === nativePort) onNativeMessage(raw);
    });
    handshakeTimer = setTimeout(() => stopNative("HOST_TIMEOUT", true), 12000);

    void chrome.storage.local.get("connection").then(({ connection }) => {
      if (port !== nativePort) return;
      sendNative({
        type: "hello",
        payload: { protocol: PROTOCOL_VERSION, config: { ...DEFAULT_CONNECTION, ...connection } },
      });
    }).catch(() => {
      if (port === nativePort) stopNative("DISCONNECTED");
    });
  } catch {
    stopNative("DISCONNECTED", true);
  }
}

function removeAttachment(panel: Panel, id: string, expired = false) {
  if (panel.attachments.delete(id)) post(panel, { type: "context.removed", id, expired });
}

function invalidateTab(tabId: number) {
  for (const panel of panels) {
    for (const [id, entry] of panel.attachments) {
      if (entry.attachment.tabId === tabId) removeAttachment(panel, id, true);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" || change.url !== undefined) invalidateTab(tabId);
});
chrome.tabs.onRemoved.addListener(invalidateTab);
chrome.tabs.onDetached.addListener(invalidateTab);
chrome.permissions.onRemoved.addListener(({ origins }) => {
  if (!origins?.length) return;
  for (const panel of panels) {
    for (const [id, entry] of panel.attachments) {
      if (origins.includes(entry.attachment.sitePattern)) removeAttachment(panel, id, true);
    }
  }
});

function detachPanel(panel: Panel) {
  if (!panels.delete(panel)) return;
  for (const request of requests.values()) {
    if (request.panel !== panel) continue;
    endRequest(request, "CANCELLED");
    if (request.sent) sendNative({ type: "cancel", id: request.id });
  }
  if (!panels.size) idleTimer = setTimeout(() => stopNative(), 5000);
}

async function stageContext(panel: Panel, kind: "page" | "selection", tabId?: number) {
  if (panel.windowId === null) return;
  const willReplace = tabId !== undefined && [...panel.attachments.values()].some(({ attachment }) =>
    attachment.tabId === tabId && attachment.kind === kind);
  if (!willReplace && panel.attachments.size >= MAX_ATTACHMENTS) {
    throw new Error(`Bạn có thể đính kèm tối đa ${MAX_ATTACHMENTS} mục.`);
  }

  const entry = await captureTab(panel.windowId, kind, tabId);
  if (!panels.has(panel)) return;
  const existing = [...panel.attachments.values()].find(({ attachment }) =>
    attachment.tabId === entry.tabId && attachment.kind === kind);
  if (existing) removeAttachment(panel, existing.attachment.id);
  if (panel.attachments.size >= MAX_ATTACHMENTS) throw new Error("Đã đạt giới hạn đính kèm.");

  const attachment: Attachment = {
    ...entry.context, id: crypto.randomUUID(), tabId: entry.tabId, sitePattern: entry.sitePattern, kind,
  };
  panel.attachments.set(attachment.id, { attachment, documentId: entry.documentId, pageUrl: entry.pageUrl });
  post(panel, { type: "context.added", attachment });
  recordActivity("attached", 1);
}

async function handleChat(panel: Panel, message: Extract<PanelMessage, { type: "chat.send" }>) {
  if (bridgeStatus.phase !== "ready") {
    post(panel, { type: "chat.error", id: message.id, code: bridgeStatus.phase === "error" ? bridgeStatus.code : "DISCONNECTED" });
    return;
  }
  if (requests.has(message.id) || [...requests.values()].some((request) => request.panel === panel)) {
    post(panel, { type: "chat.error", id: message.id, code: "BUSY" });
    return;
  }
  const request: Request = { id: message.id, panel, sent: false, length: 0, agentMode: message.agentMode === true };
  requests.set(request.id, request);
  const ids = [...new Set(message.attachmentIds)].slice(0, MAX_ATTACHMENTS);
  const verified = await Promise.all(ids.map(async (id) => {
    const entry = panel.attachments.get(id);
    if (!entry || !await isSameDocument(entry.attachment.tabId, entry.documentId, entry.pageUrl)) return null;
    return panel.attachments.get(id) === entry ? entry.attachment : null;
  }));
  if (requests.get(request.id) !== request) return;
  if (verified.some((entry, index) => !entry || panel.attachments.get(ids[index])?.attachment !== entry)) {
    verified.forEach((entry, index) => {
      if (!entry) removeAttachment(panel, ids[index], true);
    });
    endRequest(request, "CONTEXT_CHANGED");
    return;
  }

  const contexts = verified.map((entry) => ({
    url: entry!.url, title: entry!.title, content: entry!.content, redactedCount: entry!.redactedCount,
  }));

  // Capture a fast initial snapshot (~20ms) so Turn 1 already has element refs and saves an LLM round-trip.
  let initialSnapshot: Record<string, unknown> | undefined;
  if (request.agentMode && panel.windowId !== null) {
    try {
      const snap = await executeBrowserTool(panel.windowId, "browser_get_snapshot", {});
      if (snap.ok === true) initialSnapshot = snap;
    } catch {
      // Ignore if tab is chrome:// or permission not yet granted.
    }
    if (requests.get(request.id) !== request) return;
  }

  request.sent = true;
  if (sendNative({
    type: "chat", id: request.id, payload: {
      message: message.text.slice(0, MAX_MESSAGE_LENGTH),
      model: message.model.slice(0, 100),
      agentMode: request.agentMode,
      initialSnapshot,
      history: message.history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 1200) })),
      contexts,
    },
  })) {
    recordActivity("sent", contexts.length);
  } else {
    endRequest(request, "DISCONNECTED");
  }
}

function saveConversation(conversation: SavedConversation) {
  return enqueueStorage(async () => {
    const result = await chrome.storage.local.get("conversations");
    const conversations: SavedConversation[] = Array.isArray(result.conversations) ? result.conversations : [];
    const title = redactText(conversation.title, 80).text;
    const messages = conversation.messages.slice(-30).map(({ id, role, content, error }) => ({
      id, role, content: content.slice(0, MAX_REPLY_LENGTH), error,
    }));
    const next = [{ ...conversation, title, messages }, ...conversations.filter((item) => item.id !== conversation.id)];
    const capped: SavedConversation[] = [];
    let bytes = 0;
    for (const entry of next.slice(0, 40)) {
      bytes += new TextEncoder().encode(JSON.stringify(entry)).length;
      if (bytes > 4_000_000) break;
      capped.push(entry);
    }
    await chrome.storage.local.set({ conversations: capped });
  });
}

async function handlePanelMessage(panel: Panel, message: PanelMessage) {
  if (message.type === "panel.open") {
    if (panel.windowId !== null || !Number.isInteger(message.windowId)) return;
    panel.windowId = message.windowId;
    const prefill = pendingPrefills.get(message.windowId);
    pendingPrefills.delete(message.windowId);
    if (prefill && prefill.expires >= Date.now()) post(panel, { type: "context.prefill", text: prefill.text });
    return;
  }
  if (panel.windowId === null) return;

  switch (message.type) {
    case "bridge.reconnect":
      retries = 0;
      stopNative();
      connectNative();
      break;
    case "chat.send":
      await handleChat(panel, message);
      break;
    case "chat.cancel": {
      const request = requests.get(message.id);
      if (request?.panel !== panel) return;
      endRequest(request, "CANCELLED");
      if (request.sent) sendNative({ type: "cancel", id: request.id });
      break;
    }
    case "context.read":
      await stageContext(panel, message.kind, message.tabId);
      break;
    case "context.remove":
      removeAttachment(panel, message.id);
      break;
    case "tabs.list": {
      const tabs = await chrome.tabs.query({ windowId: panel.windowId });
      post(panel, { type: "tabs.list", tabs: tabs.map(summarizeTab).filter((tab) => tab !== undefined) });
      break;
    }
    case "history.save":
      await saveConversation(message.conversation);
      break;
    case "history.remove":
      await enqueueStorage(async () => {
        const { conversations } = await chrome.storage.local.get("conversations");
        if (Array.isArray(conversations)) {
          await chrome.storage.local.set({ conversations: conversations.filter((item) => item.id !== message.id) });
        }
      });
      break;
    case "data.clearAudit":
      await enqueueStorage(() => chrome.storage.local.remove(["activity", "auditTrail"]));
      break;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "gravity-panel" || port.sender?.url !== chrome.runtime.getURL("sidepanel.html")) {
    port.disconnect();
    return;
  }
  clearTimeout(idleTimer);
  const panel: Panel = { port, windowId: null, attachments: new Map() };
  panels.add(panel);
  port.onDisconnect.addListener(() => detachPanel(panel));
  port.onMessage.addListener((message: PanelMessage) => {
    void handlePanelMessage(panel, message).catch((error: unknown) => {
      if (message.type === "context.read" || message.type === "tabs.list") {
        post(panel, { type: "context.error", message: error instanceof Error ? error.message : "Không thể đọc tab." });
      } else if (message.type === "chat.send") {
        const request = requests.get(message.id);
        if (request?.panel === panel) endRequest(request, "BACKEND_ERROR");
      } else {
        post(panel, { type: "data.error", message: "Không thể cập nhật dữ liệu cục bộ." });
      }
    });
  });
  post(panel, { type: "bridge.status", status: bridgeStatus });
  if (availableModels.length) post(panel, { type: "models.list", models: availableModels });
  connectNative();
});
