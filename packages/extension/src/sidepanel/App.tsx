import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  Attachment, BridgeStatus, BUILTIN_SLASH_COMMANDS, ChatMessage, CustomPrompt, DEFAULT_SETTINGS,
  MAX_ATTACHMENTS, MAX_MESSAGE_LENGTH, MODEL_OPTIONS, PanelMessage, SavedConversation, TabSummary,
  UserSettings, WorkerMessage, bridgeError,
} from "../shared/protocol";
import { ChatMessageItem } from "./components/ChatMessageItem";

const SettingsDrawer = lazy(() => import("./components/SettingsDrawer"));
const HistoryDrawer = lazy(() => import("./components/HistoryDrawer").then((module) => ({ default: module.HistoryDrawer })));
const EMPTY_STATUS: BridgeStatus = { phase: "connecting" };
const ALL_WEB_ORIGINS = ["https://*/*", "http://*/*"];
const QUICK_PROMPTS = [
  { label: "Tóm tắt trang này", text: "Tóm tắt nội dung trang này thành các ý chính.", kind: "page" },
  { label: "Rút ra việc cần làm", text: "Liệt kê các việc cần làm được đề cập trên trang này.", kind: "page" },
  { label: "Tìm và thao tác trên trang", text: "Đọc cấu trúc trang hiện tại và cho tôi biết các thao tác chính có thể làm.", kind: "none" },
] as const;

type Running = {
  id: string;
  question: string;
  content: string;
  conversationId: string;
  attachmentIds: string[];
  toolStatus?: string;
};

const TOOL_LABELS: Record<string, string> = {
  browser_get_snapshot: "Đang đọc cấu trúc trang",
  browser_click: "Đang nhấp phần tử",
  browser_fill: "Đang điền nội dung",
  browser_select_option: "Đang chọn tùy chọn",
  browser_press_key: "Đang nhấn phím",
  browser_scroll: "Đang cuộn trang",
  browser_list_tabs: "Đang xem danh sách tab",
  browser_open_tab: "Đang mở tab mới",
  browser_switch_tab: "Đang chuyển tab",
  browser_close_tab: "Đang đóng tab",
  browser_navigate: "Đang chuyển hướng trang",
};

function normalizeSettings(value: Partial<UserSettings> | undefined): UserSettings {
  return {
    theme: value?.theme === "dark" || value?.theme === "light" ? value.theme : "system",
    model: typeof value?.model === "string" ? value.model : "",
    customPrompts: Array.isArray(value?.customPrompts) ? value.customPrompts.filter((item) =>
      typeof item?.id === "string" && typeof item.command === "string" &&
      typeof item.label === "string" && typeof item.template === "string") : [],
  };
}

export function App() {
  const [status, setStatus] = useState<BridgeStatus>(EMPTY_STATUS);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [drawer, setDrawer] = useState<"settings" | "history" | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState<Running | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [tabs, setTabs] = useState<TabSummary[]>([]);
  const [popup, setPopup] = useState<"tabs" | "prompts" | null>(null);
  const [selectedOption, setSelectedOption] = useState(0);
  const [notice, setNotice] = useState("");
  const [remoteStatus, setRemoteStatus] = useState("");
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [reading, setReading] = useState(false);
  const [grantedSites, setGrantedSites] = useState<string[]>([]);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const port = useRef<chrome.runtime.Port | null>(null);
  const active = useRef<Running | null>(null);
  const pendingSave = useRef<Extract<PanelMessage, { type: "history.save" }> | null>(null);
  const completed = useRef<ChatMessage[]>([]);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const autoScroll = useRef(true);
  const frame = useRef<number | null>(null);
  const choose = useRef<(message: WorkerMessage) => void>(() => {});

  const send = useCallback((message: PanelMessage) => {
    if (!port.current) return false;
    try {
      port.current.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshPermissions = useCallback(() => {
    void chrome.permissions.getAll().then(({ origins }) => setGrantedSites(origins ?? []));
  }, []);

  useEffect(() => {
    void chrome.storage.sync.get(["preferencesV2", "settings"]).then(({ preferencesV2, settings: old }) =>
      setSettings(normalizeSettings(preferencesV2 ?? old)));
    void chrome.storage.local.get("dataConsentV2").then(({ dataConsentV2 }) => setConsent(dataConsentV2 === true));
    refreshPermissions();
    chrome.permissions.onAdded.addListener(refreshPermissions);
    chrome.permissions.onRemoved.addListener(refreshPermissions);
    return () => {
      chrome.permissions.onAdded.removeListener(refreshPermissions);
      chrome.permissions.onRemoved.removeListener(refreshPermissions);
    };
  }, [refreshPermissions]);

  function updatePreferences(next: UserSettings) {
    setSettings(next);
    void chrome.storage.sync.set({ preferencesV2: next }).catch(() => setNotice("Không thể lưu tùy chọn."));
  }

  function replaceMessages(next: ChatMessage[]) {
    completed.current = next;
    setMessages(next);
  }

  function finish(id: string, code?: string) {
    const run = active.current;
    if (!run || run.id !== id) return;
    active.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setRunning(null);

    const answer = { id, role: "assistant" as const, content: run.content, error: code ? bridgeError(code) : undefined };
    const next = [...completed.current, answer];
    replaceMessages(next);
    const first = next.find((message) => message.role === "user");
    const save: Extract<PanelMessage, { type: "history.save" }> = {
      type: "history.save",
      conversation: { id: run.conversationId, title: first?.content.slice(0, 80) || "Cuộc trò chuyện", updatedAt: Date.now(), messages: next },
    };
    if (!send(save)) pendingSave.current = save;
    if (code && code !== "CANCELLED") setInput((current) => current || run.question);
    if (!code) run.attachmentIds.forEach((id) => send({ type: "context.remove", id }));
  }

  choose.current = (message) => {
    switch (message.type) {
      case "bridge.status":
        setStatus(message.status);
        break;
      case "chat.delta": {
        if (!active.current || active.current.id !== message.id) break;
        active.current.content += message.text;
        active.current.toolStatus = undefined;
        if (frame.current === null) {
          frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (active.current) setRunning({ ...active.current });
          });
        }
        break;
      }
      case "chat.tool": {
        if (!active.current || active.current.id !== message.id) break;
        const label = TOOL_LABELS[message.name] ?? `Đang chạy ${message.name}`;
        active.current.toolStatus = message.status === "running"
          ? `${label}…`
          : message.status === "error"
            ? `${label} (lỗi${message.detail ? `: ${message.detail}` : ""})`
            : `${label} ✓`;
        setRunning({ ...active.current });
        break;
      }
      case "remote.tool": {
        const label = TOOL_LABELS[message.name] ?? message.name;
        clearTimeout(remoteTimer.current);
        if (message.status === "running") {
          setRemoteStatus(`Antigravity từ xa: ${label}…`);
        } else {
          setRemoteStatus(message.status === "error"
            ? `Antigravity từ xa: ${label} lỗi`
            : `Antigravity từ xa: ${label} ✓`);
          remoteTimer.current = setTimeout(() => setRemoteStatus(""), 3000);
        }
        break;
      }
      case "chat.done":
      case "chat.error":
        finish(message.id, message.type === "chat.error" ? message.code : undefined);
        break;
      case "context.added":
        setReading(false);
        setAttachments((current) => [...current, message.attachment]);
        setPreview(message.attachment);
        break;
      case "context.removed":
        setAttachments((current) => current.filter((entry) => entry.id !== message.id));
        setPreview((current) => current?.id === message.id ? null : current);
        if (message.expired) setNotice("Một mục đính kèm đã hết hiệu lực vì tab hoặc quyền truy cập thay đổi.");
        break;
      case "context.error":
        setReading(false);
        setNotice(message.message);
        break;
      case "tabs.list":
        setTabs(message.tabs);
        break;
      case "context.prefill":
        setInput((current) => current || message.text);
        composer.current?.focus();
        break;
      case "data.error":
        setNotice(message.message);
        break;
    }
  };

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let connection: chrome.runtime.Port | undefined;
    async function connect() {
      const window = await chrome.windows.getCurrent();
      if (stopped || window.id === undefined) return;
      connection = chrome.runtime.connect({ name: "gravity-panel" });
      port.current = connection;
      connection.onMessage.addListener((message: WorkerMessage) => choose.current(message));
      connection.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (stopped) return;
        port.current = null;
        setStatus({ phase: "error", code: "DISCONNECTED" });
        setAttachments([]);
        setPreview(null);
        setReading(false);
        if (active.current) choose.current({ type: "chat.error", id: active.current.id, code: "DISCONNECTED" });
        retry = setTimeout(() => void connect().catch(() => {}), 750);
      });
      connection.postMessage({ type: "panel.open", windowId: window.id } satisfies PanelMessage);
      if (pendingSave.current && send(pendingSave.current)) pendingSave.current = null;
    }
    void connect().catch(() => setStatus({ phase: "error", code: "DISCONNECTED" }));
    return () => {
      stopped = true;
      clearTimeout(retry);
      connection?.disconnect();
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      port.current = null;
    };
  }, [send]);

  useEffect(() => {
    if (scroll.current && autoScroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, running, drawer]);

  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = "auto";
    composer.current.style.height = `${Math.min(130, composer.current.scrollHeight)}px`;
  }, [input]);

  // Auto-poll reconnect every 3s while waiting for companion installation on first setup.
  useEffect(() => {
    if (status.phase !== "error" || (status.code !== "HOST_MISSING" && status.code !== "HOST_FORBIDDEN")) return;
    const poll = setInterval(() => {
      if (!active.current) send({ type: "bridge.reconnect" });
    }, 3000);
    return () => clearInterval(poll);
  }, [status, send]);

  function closeDrawer() {
    setDrawer(null);
    requestAnimationFrame(() => drawerTrigger.current?.focus());
  }

  function openDrawer(next: "settings" | "history") {
    if (drawer === next) {
      closeDrawer();
      return;
    }
    setPopup(null);
    setPreview(null);
    setDrawer(next);
    if (next === "history") {
      void chrome.storage.local.get("conversations").then(({ conversations }) => {
        setConversations(Array.isArray(conversations) ? conversations : []);
      });
    }
  }

  function newChat() {
    if (active.current) return;
    setConversationId(crypto.randomUUID());
    replaceMessages([]);
    attachments.forEach((entry) => send({ type: "context.remove", id: entry.id }));
    setInput("");
    setPreview(null);
    setPopup(null);
    setNotice("");
    setDrawer(null);
    requestAnimationFrame(() => composer.current?.focus());
  }

  function read(kind: "page" | "selection", tabId?: number) {
    if (reading || active.current || consent !== true) return;
    setPopup(null);
    setNotice("");
    if (send({ type: "context.read", kind, tabId })) setReading(true);
    else setNotice("Side panel đang kết nối lại.");
  }

  function openTabs() {
    setSelectedOption(0);
    setPopup("tabs");
    send({ type: "tabs.list" });
  }

  function requestSiteAccess(attachment: Attachment) {
    const origin = attachment.sitePattern;
    setNotice("");
    void chrome.permissions.request({ origins: [origin] }).then((granted) => {
      if (granted) {
        refreshPermissions();
        setNotice("Đã lưu quyền cho website trong hồ sơ Chrome này.");
      } else {
        setNotice("Có thể tiếp tục dùng nội dung đã đính kèm trong lượt này.");
      }
    }).catch(() => setNotice("Chrome không thể cấp quyền cho website này."));
  }

  function requestAllWebAccess() {
    setNotice("");
    void chrome.permissions.request({ origins: ALL_WEB_ORIGINS }).then((granted) => {
      refreshPermissions();
      setNotice(granted
        ? "Đã cấp quyền tương tác trình duyệt 1 lần thành công."
        : "Bạn có thể cấp quyền sau hoặc cấp từng trang khi cần.");
    }).catch(() => setNotice("Chrome không thể mở hộp thoại cấp quyền."));
  }

  function acceptDataUse(grantBrowserAccess = false) {
    if (grantBrowserAccess) {
      void chrome.permissions.request({ origins: ALL_WEB_ORIGINS }).then(refreshPermissions).catch(() => {});
    }
    void chrome.storage.local.set({ dataConsentV2: true }).then(() => {
      setConsent(true);
      setNotice("");
      requestAnimationFrame(() => composer.current?.focus());
    }).catch(() => setNotice("Không thể lưu lựa chọn quyền riêng tư."));
  }

  function handleSend() {
    const text = input.trim();
    if (!text || active.current || status.phase !== "ready" || consent !== true || reading) return;
    const id = crypto.randomUUID();
    const attachmentIds = attachments.map((entry) => entry.id);
    const history = completed.current
      .filter((message) => message.content && !message.error)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));
    if (!send({ type: "chat.send", id, text, model: settings.model, agentMode: true, attachmentIds, history })) {
      setNotice("Side panel đang kết nối lại. Bản nháp vẫn ở đây.");
      return;
    }
    const run = { id, question: text, content: "", conversationId, attachmentIds };
    autoScroll.current = true;
    active.current = run;
    setRunning(run);
    replaceMessages([...completed.current, { id: `${id}-question`, role: "user", content: text }]);
    setInput("");
    setPopup(null);
    setPreview(null);
    setNotice("");
  }

  const promptFilter = input.startsWith("/") ? input.slice(1).trim().toLowerCase() : "";
  const tabFilter = input.match(/(?:^|\s)@([^\s@]*)$/)?.[1]?.toLowerCase() ?? "";
  const customCommands = new Set(settings.customPrompts.map((item) => item.command));
  const allPrompts = [
    ...BUILTIN_SLASH_COMMANDS.filter((item) => !customCommands.has(item.command)),
    ...settings.customPrompts,
  ];
  const filteredPrompts = allPrompts.filter((item) =>
    item.command.toLowerCase().includes(promptFilter) || item.label.toLowerCase().includes(promptFilter));
  const filteredTabs = tabs.filter((tab) => tab.title.toLowerCase().includes(tabFilter));

  function selectPrompt(prompt: CustomPrompt) {
    setInput(prompt.template);
    setPopup(null);
    composer.current?.focus();
  }

  function selectTab(tab: TabSummary) {
    setInput((current) => current.replace(/(?:^|\s)@[^\s@]*$/, "").trimEnd());
    read("page", tab.id);
    composer.current?.focus();
  }

  function composerKeys(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      setPopup(null);
      setPreview(null);
      return;
    }

    const count = popup === "tabs" ? filteredTabs.length : popup === "prompts" ? filteredPrompts.length : 0;
    if (count && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSelectedOption((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const index = Math.min(selectedOption, count - 1);
    if (popup === "tabs" && count) selectTab(filteredTabs[index]);
    else if (popup === "prompts" && count) selectPrompt(filteredPrompts[index]);
    else if (!popup) handleSend();
  }

  const ready = status.phase === "ready";
  const limit = attachments.length >= MAX_ATTACHMENTS;
  const allowRead = consent === true && !reading && !running;
  const hasFullWebAccess = ALL_WEB_ORIGINS.every((origin) => grantedSites.includes(origin));
  const activeOption = popup === "tabs" ? filteredTabs.length : popup === "prompts" ? filteredPrompts.length : 0;
  const clampedOption = activeOption ? Math.min(selectedOption, activeOption - 1) : 0;
  const statusText = status.phase === "ready" ? `Sẵn sàng · ${status.backend.toUpperCase()}`
    : status.phase === "connecting" ? "Đang kết nối" : "Cần kết nối";
  const modelChoices = MODEL_OPTIONS.some((m) => m.id === settings.model)
    ? MODEL_OPTIONS
    : [...MODEL_OPTIONS, { id: settings.model, label: settings.model }];

  const isMac = /Mac|iPhone|iPad/i.test(navigator.userAgent);
  const isWindows = /Windows/i.test(navigator.userAgent);
  const installCmd = isWindows
    ? `$env:GECKO_EXT_ID="${chrome.runtime.id}"; irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex`
    : `curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- ${chrome.runtime.id}`;
  const showSetupWizard = status.phase === "error" && (status.code === "HOST_MISSING" || status.code === "HOST_FORBIDDEN");
  const showBackendWizard = status.phase === "error" && (status.code === "CLI_MISSING" || status.code === "SDK_AUTH_REQUIRED");

  return (
    <div className="app" data-theme={settings.theme} onKeyDown={(event) => {
      if (event.key === "Escape" && drawer) closeDrawer();
    }}>
      <header className="topbar">
        <div className="brand">
          <img src="icons/icon48.png" width="32" height="32" alt="" />
          <div>
            <div className="title">Gecko for Antigravity</div>
            <div className="subtitle" role="status"><span className={`dot ${status.phase}`} />{statusText}</div>
          </div>
        </div>
        <nav className="top-actions" aria-label="Hội thoại và cài đặt">
          <button className="icon-btn" title="Hội thoại mới" aria-label="Hội thoại mới" onClick={newChat} disabled={!!running}>+</button>
          <button className="icon-btn" title="Lịch sử hội thoại" aria-label="Lịch sử hội thoại" aria-pressed={drawer === "history"}
            onClick={(event) => { drawerTrigger.current = event.currentTarget; openDrawer("history"); }}>↺</button>
          <button className="icon-btn" title="Cài đặt" aria-label="Cài đặt" aria-pressed={drawer === "settings"}
            onClick={(event) => { drawerTrigger.current = event.currentTarget; openDrawer("settings"); }}>⚙</button>
        </nav>
      </header>

      {drawer ? (
        <div className="drawer">
          <div className="drawer-nav"><button className="text-btn" onClick={closeDrawer}>← Về hội thoại</button></div>
          <Suspense fallback={<p className="muted-note">Đang tải…</p>}>
            {drawer === "settings" ? <SettingsDrawer settings={settings} status={status} onSave={updatePreferences}
              onReconnect={() => {
                if (active.current) return;
                send({ type: "bridge.reconnect" });
              }} busy={!!running} grantedSites={grantedSites} onPermissionsChange={refreshPermissions}
              onClearAudit={() => send({ type: "data.clearAudit" })} />
              : <HistoryDrawer conversations={conversations} activeId={conversationId}
                busy={!!running}
                onNewChat={newChat} onSelect={(entry) => {
                  if (active.current) return;
                  setConversationId(entry.id);
                  replaceMessages(entry.messages);
                  attachments.forEach((attachment) => send({ type: "context.remove", id: attachment.id }));
                  setInput("");
                  setNotice("");
                  closeDrawer();
                }} onDelete={(id) => {
                  if (!send({ type: "history.remove", id })) return;
                  setConversations((items) => items.filter((entry) => entry.id !== id));
                  if (id === conversationId && !active.current) newChat();
                }} />}
          </Suspense>
        </div>
      ) : (
        <>
          <main className="chat" ref={scroll} onScroll={(event) => {
            const el = event.currentTarget;
            autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }} aria-label="Hội thoại">
            {remoteStatus && <div className="remote-pill" role="status">⚡ {remoteStatus}</div>}
            {showSetupWizard && <section className="setup-wizard">
              <h2>Cài đặt nhanh trên {isMac ? "macOS" : isWindows ? "Windows" : "Linux"} (1 dòng lệnh)</h2>
              <p>Mở {isWindows ? "PowerShell" : "Terminal"} và dán lệnh sau để tự động cài companion (không cần tải thư mục thủ công):</p>
              <code className="setup-cmd">{installCmd}</code>
              <div className="row-actions">
                <button className="primary-btn" type="button" onClick={() => {
                  void navigator.clipboard.writeText(installCmd).then(() => {
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 1800);
                  }).catch(() => setNotice("Không thể sao chép tự động."));
                }}>{copiedCmd ? "Đã sao chép lệnh ✓" : "Sao chép lệnh cài"}</button>
                <button className="outline-btn" type="button" onClick={() => send({ type: "bridge.reconnect" })}>Kiểm tra lại</button>
                <button className="text-btn" type="button" onClick={() => openDrawer("settings")}>Cài đặt</button>
              </div>
              <small className="muted-note">Đang tự động kiểm tra kết nối mỗi 3 giây…</small>
            </section>}
            {showBackendWizard && <section className="setup-wizard">
              <h2>Chưa tìm thấy Antigravity CLI / SDK</h2>
              <p>{bridgeError(status.code)} Nếu máy {isMac ? "Mac " : ""}chỉ cài Antigravity App (chưa có <code>agy</code> CLI), bạn có thể cài <code>agy</code> hoặc chạy lại bộ cài thêm <code>--sdk</code> và cấu hình <code>GEMINI_API_KEY</code>.</p>
              <div className="row-actions">
                <button className="primary-btn" type="button" onClick={() => openDrawer("settings")}>Mở Cài đặt kết nối</button>
                <button className="outline-btn" type="button" onClick={() => send({ type: "bridge.reconnect" })}>Thử kết nối lại</button>
              </div>
            </section>}
            {status.phase === "error" && !showSetupWizard && !showBackendWizard && <div className="connection-banner">
              <span>{bridgeError(status.code)}</span>
              <button className="text-btn" onClick={() => openDrawer("settings")}>Cấu hình kết nối</button>
            </div>}
            {consent === true && !hasFullWebAccess && <div className="permission-banner">
              <span>Cấp quyền tương tác 1 lần để Gecko tự thao tác trên mọi tab mà không cần bấm lại biểu tượng.</span>
              <button className="text-btn" onClick={requestAllWebAccess}>Cấp quyền 1 lần</button>
            </div>}
            {consent === false && <section className="consent-card">
              <h2>Chào mừng đến với Gecko for Antigravity</h2>
              <p>Tin nhắn và nội dung trang bạn chọn được gửi qua companion cục bộ tới Antigravity để trả lời hoặc tự động thao tác trên trình duyệt. Các trang mật khẩu, thanh toán và CAPTCHA luôn được chặn bảo vệ.</p>
              <div className="row-actions">
                <button className="primary-btn" onClick={() => acceptDataUse(true)}>Tiếp tục & cấp quyền 1 lần</button>
                <button className="outline-btn" onClick={() => acceptDataUse(false)}>Chỉ cấp từng trang</button>
              </div>
            </section>}
            {messages.length === 0 && consent === true && !showSetupWizard && <section className="empty-state">
              <img src="icons/icon128.png" width="56" height="56" alt="" />
              <h1>Gecko for Antigravity</h1>
              <p>Hỏi đáp, tóm tắt hoặc giao việc trực tiếp trên trình duyệt của bạn.</p>
              <div className="suggestions">
                {QUICK_PROMPTS.map((prompt) => <button className="outline-btn" key={prompt.label}
                  disabled={!allowRead}
                  onClick={() => {
                    setInput(prompt.text);
                    if (prompt.kind === "page" && !attachments.length) read("page");
                    composer.current?.focus();
                  }}>{prompt.label}</button>)}
              </div>
            </section>}
            {messages.map((message) => <ChatMessageItem key={message.id} message={message} />)}
            {running && <ChatMessageItem message={{ id: running.id, role: "assistant", content: running.content }}
              streaming toolStatus={running.toolStatus} />}
            {running && <span className="sr-only" role="status">Đang nhận phản hồi</span>}
          </main>

          <footer className="composer-area">
            {notice && <div className="notice" role="status">{notice}<button className="icon-btn"
              aria-label="Đóng thông báo" onClick={() => setNotice("")}>×</button></div>}
            {preview && <section className="preview" aria-label="Xem trước ngữ cảnh">
              <div className="preview-head">
                <div><strong>{preview.title}</strong><small>{preview.url}</small></div>
                <button className="icon-btn" aria-label="Đóng xem trước" onClick={() => setPreview(null)}>×</button>
              </div>
              <p>{preview.content}</p>
              <div className="preview-actions">
                {preview.redactedCount > 0 && <small>Đã ẩn {preview.redactedCount} chuỗi nhạy cảm</small>}
                {grantedSites.includes(preview.sitePattern)
                  ? <small>Website đã được cấp quyền</small>
                  : <button className="text-btn" onClick={() => requestSiteAccess(preview)}>Luôn cho phép website này</button>}
              </div>
            </section>}
            <div className="composer-shell">
              {attachments.length > 0 && <div className="attachments" aria-label="Nội dung đính kèm">
                {attachments.map((entry) => <span className="attachment" key={entry.id}>
                  <button onClick={() => setPreview((value) => value?.id === entry.id ? null : entry)}
                    title={entry.title}>{entry.kind === "selection" ? "Đoạn văn" : entry.title}</button>
                  <button disabled={!!running} aria-label={`Gỡ ${entry.title}`}
                    onClick={() => send({ type: "context.remove", id: entry.id })}>×</button>
                </span>)}
              </div>}
              <div className="composer-input">
                <textarea ref={composer} rows={1} value={input} maxLength={MAX_MESSAGE_LENGTH}
                  aria-label="Tin nhắn cho Gecko for Antigravity" aria-controls={popup ? "composer-options" : undefined}
                  aria-activedescendant={popup && activeOption ? `composer-option-${clampedOption}` : undefined}
                  placeholder="Hỏi hoặc giao việc cho Gecko…" onKeyDown={composerKeys} onChange={(event) => {
                    const value = event.currentTarget.value;
                    setInput(value);
                    setSelectedOption(0);
                    if (value.startsWith("/")) setPopup("prompts");
                    else if (consent && !running && !limit && /(?:^|\s)@[^\s@]*$/.test(value)) {
                      if (popup !== "tabs") openTabs();
                    } else setPopup(null);
                  }} />
                {running ? <button className="send-icon-btn stop" type="button" title="Dừng" aria-label="Dừng" onClick={() => {
                  if (!send({ type: "chat.cancel", id: running.id })) finish(running.id, "CANCELLED");
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2.5" />
                  </svg>
                </button> : <button className="send-icon-btn" type="button" title="Gửi" aria-label="Gửi" onClick={handleSend}
                  disabled={!input.trim() || !ready || !consent || reading}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
                  </svg>
                </button>}
              </div>
              <div className="composer-tools">
                <button className="text-btn" disabled={!allowRead || limit} onClick={() => read("page")}>+ Trang</button>
                <button className="text-btn" disabled={!allowRead || limit} aria-expanded={popup === "tabs"}
                  onClick={() => popup === "tabs" ? setPopup(null) : openTabs()}>@ Tab</button>
                <button className="text-btn" aria-label="Lệnh nhanh" aria-expanded={popup === "prompts"}
                  onClick={() => { setSelectedOption(0); setPopup(popup === "prompts" ? null : "prompts"); composer.current?.focus(); }}>/</button>
                <select className="model-select" aria-label="Chọn model AI" value={settings.model} disabled={!!running}
                  onChange={(event) => updatePreferences({ ...settings, model: event.currentTarget.value })}>
                  {modelChoices.map((m) => <option key={m.id || "default"} value={m.id}>{m.label}</option>)}
                </select>
                {reading && <small role="status">Đang đọc…</small>}
              </div>
              {popup && <div className="composer-popup" id="composer-options" role="listbox"
                aria-label={popup === "tabs" ? "Chọn tab đính kèm" : "Chọn lệnh nhanh"}>
                {popup === "tabs" && (filteredTabs.length ? filteredTabs.map((tab, index) =>
                  <button key={tab.id} id={`composer-option-${index}`} role="option"
                    aria-selected={index === clampedOption} onClick={() => selectTab(tab)}>
                    <span>{tab.title}</span>{tab.active && <small>Đang mở</small>}
                  </button>) : <p className="muted-note">Cấp quyền 1 lần hoặc mở biểu tượng trên tab bạn muốn chia sẻ.</p>)}
                {popup === "prompts" && (filteredPrompts.length ? filteredPrompts.map((prompt, index) =>
                  <button key={prompt.id} id={`composer-option-${index}`} role="option"
                    aria-selected={index === clampedOption} onClick={() => selectPrompt(prompt)}>
                    <span>{prompt.label}</span><small>{prompt.command}</small>
                  </button>) : <p className="muted-note">Không tìm thấy lệnh phù hợp.</p>)}
              </div>}
            </div>
            <div className="composer-meta"><span>{attachments.length ? `${attachments.length} mục sẽ gửi` : "Chưa đính kèm ngữ cảnh"}</span>
              <span>Shift+Enter để xuống dòng</span></div>
          </footer>
        </>
      )}
    </div>
  );
}
