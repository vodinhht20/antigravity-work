export const NATIVE_HOST_NAME = "com.antigravity.browser_bridge";
export const PROTOCOL_VERSION = 2;
export const MAX_ATTACHMENTS = 3;
export const MAX_MESSAGE_LENGTH = 8000;
export const MAX_REPLY_LENGTH = 32000;

export type Backend = "auto" | "cli" | "sdk";
export interface ConnectionSettings {
  backend: Backend;
  cliPath: string;
}
export const DEFAULT_CONNECTION: ConnectionSettings = { backend: "auto", cliPath: "" };

export type BridgeStatus =
  | { phase: "connecting" }
  | { phase: "ready"; backend: "cli" | "sdk"; version: string }
  | { phase: "error"; code: string };

export interface UserSettings {
  theme: "system" | "light" | "dark";
  model: string;
  customPrompts: CustomPrompt[];
}
export const DEFAULT_SETTINGS: UserSettings = { theme: "system", model: "", customPrompts: [] };

export interface ModelOption {
  id: string;
  label: string;
}

export const DEFAULT_MODEL_OPTION: ModelOption = { id: "", label: "Mặc định (CLI)" };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface CustomPrompt {
  id: string;
  command: string;
  label: string;
  template: string;
}

export const BUILTIN_SLASH_COMMANDS: CustomPrompt[] = [
  { id: "summary", command: "/tomtat", label: "Tóm tắt", template: "Tóm tắt nội dung đính kèm thành các ý chính." },
  { id: "translate", command: "/dich", label: "Dịch sang tiếng Việt", template: "Dịch nội dung đính kèm sang tiếng Việt tự nhiên, giữ nguyên thuật ngữ kỹ thuật." },
  { id: "explain", command: "/giaithich", label: "Giải thích", template: "Giải thích nội dung đính kèm bằng ngôn ngữ dễ hiểu và cho ví dụ minh họa." },
];

export type ContextKind = "page" | "selection";
export interface PageContext {
  url: string;
  title: string;
  content: string;
  redactedCount: number;
}

export interface Attachment extends PageContext {
  id: string;
  tabId: number;
  kind: ContextKind;
  sitePattern: string;
}

export interface TabSummary {
  id: number;
  title: string;
  sitePattern?: string;
  active: boolean;
}

export type PanelMessage =
  | { type: "panel.open"; windowId: number }
  | { type: "bridge.reconnect" }
  | { type: "chat.send"; id: string; text: string; model: string; agentMode: boolean; attachmentIds: string[]; history: Pick<ChatMessage, "role" | "content">[] }
  | { type: "chat.cancel"; id: string }
  | { type: "context.read"; kind: ContextKind; tabId?: number }
  | { type: "context.remove"; id: string }
  | { type: "tabs.list" }
  | { type: "history.save"; conversation: SavedConversation }
  | { type: "history.remove"; id: string }
  | { type: "data.clearAudit" };

export interface AuditEntry {
  id: string;
  timestamp: number;
  action: "attached" | "sent";
  count: number;
}

export type WorkerMessage =
  | { type: "bridge.status"; status: BridgeStatus }
  | { type: "models.list"; models: ModelOption[] }
  | { type: "chat.delta"; id: string; text: string }
  | { type: "chat.tool"; id: string; name: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "remote.tool"; name: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "chat.done"; id: string }
  | { type: "chat.error"; id: string; code: string }
  | { type: "context.added"; attachment: Attachment }
  | { type: "context.removed"; id: string; expired?: boolean }
  | { type: "context.error"; message: string }
  | { type: "tabs.list"; tabs: TabSummary[] }
  | { type: "context.prefill"; text: string }
  | { type: "data.error"; message: string };

const BLOCKED_HOSTS = [
  "1password.com", "bitwarden.com", "lastpass.com", "dashlane.com",
  "paypal.com", "stripe.com", "vcbdigibank.vietcombank.com.vn",
  "ebank.tpb.vn", "online.acb.com.vn", "ibanking.bidv.com.vn",
];

export function shareableUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname;
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    if (BLOCKED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
    if (/onlinebanking|ibank/.test(host) || /(?:^|[\/_-])(?:checkout|payment|billing|sign-?in|log-?in)(?:$|[\/_-])/i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function sitePattern(url: URL): string {
  return `${url.protocol}//${url.hostname}/*`;
}

export function bridgeError(code: string): string {
  switch (code) {
    case "HOST_MISSING": return "Chrome chưa tìm thấy companion. Mở Cài đặt để xem cách cài.";
    case "HOST_FORBIDDEN": return "Companion chưa đăng ký cho ID của extension này.";
    case "HOST_INCOMPATIBLE": return "Hãy cập nhật companion để dùng phiên bản extension này.";
    case "HOST_TIMEOUT": return "Companion chưa phản hồi. Kiểm tra bộ cài và thử kết nối lại.";
    case "CLI_MISSING": return "Không tìm thấy Antigravity CLI. Hãy chọn đường dẫn agy trong Cài đặt.";
    case "CLI_INVALID_PATH": return "Đường dẫn CLI phải trỏ tới tệp agy trên máy này.";
    case "CLI_UNSUPPORTED": return "Antigravity CLI chưa hỗ trợ giao thức kết nối này. Hãy cập nhật CLI.";
    case "SDK_MISSING": return "Python của companion chưa cài Antigravity SDK.";
    case "SDK_AUTH_REQUIRED": return "Hãy cấu hình xác thực SDK trên máy chạy companion.";
    case "AUTH_REQUIRED": return "Hãy mở agy trên máy, đăng nhập và kiểm tra kết nối lại.";
    case "DISCONNECTED": return "Kết nối bị gián đoạn. Bạn có thể gửi lại từ bản nháp.";
    case "CONTEXT_CHANGED": return "Ngữ cảnh đã thay đổi. Kiểm tra lại tệp đính kèm trước khi gửi.";
    case "TIMEOUT": return "Antigravity chưa trả lời trong thời gian chờ.";
    case "EMPTY_RESPONSE": return "Antigravity trả về phản hồi trống.";
    case "CANCELLED": return "Đã dừng phản hồi.";
    case "BUSY": return "Đang có một yêu cầu khác trong cửa sổ này.";
    default: return "Antigravity gặp lỗi. Hãy kiểm tra kết nối hoặc thử lại.";
  }
}
