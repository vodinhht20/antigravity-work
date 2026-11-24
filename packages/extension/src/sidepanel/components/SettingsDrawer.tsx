import React, { useEffect, useState } from "react";
import {
  AuditEntry, BridgeStatus, ConnectionSettings, DEFAULT_CONNECTION, UserSettings, bridgeError,
} from "../../shared/protocol";
import { AuditDrawer } from "./AuditDrawer";

interface Props {
  settings: UserSettings;
  status: BridgeStatus;
  onSave: (settings: UserSettings) => void;
  onReconnect: () => void;
  busy: boolean;
  grantedSites: string[];
  onPermissionsChange: () => void;
  onClearAudit: () => boolean;
}

export default function SettingsDrawer({
  settings, status, onSave, onReconnect, busy, grantedSites, onPermissionsChange, onClearAudit,
}: Props) {
  const [connection, setConnection] = useState(DEFAULT_CONNECTION);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [feedback, setFeedback] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [customCommand, setCustomCommand] = useState("");
  const [customText, setCustomText] = useState("");
  const [modelInput, setModelInput] = useState(settings.model);

  const isWindows = /Windows/i.test(navigator.userAgent);
  const extId = chrome.runtime.id;
  const installCmd = isWindows
    ? `irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex; Install-Gecko ${extId}`
    : `curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- ${extId}`;
  const installSdkCmd = isWindows
    ? `irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex; Install-Gecko ${extId} -Sdk`
    : `curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- ${extId} --sdk`;
  const uninstallCmd = isWindows
    ? "irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.ps1 | iex"
    : "curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.sh | bash";

  const isMcpOnlyReady = status.phase === "error" && (
    status.code === "CLI_MISSING" || status.code === "SDK_MISSING" || status.code === "SDK_AUTH_REQUIRED"
  );

  function copyValue(key: string, value: string, label: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setFeedback(`Đã sao chép ${label}.`);
      setTimeout(() => setCopiedKey((curr) => curr === key ? null : curr), 1800);
    }).catch(() => setFeedback("Không thể sao chép tự động."));
  }

  useEffect(() => {
    setModelInput(settings.model);
  }, [settings.model]);

  useEffect(() => {
    void chrome.storage.local.get(["connection", "activity"]).then(({ connection, activity }) => {
      setConnection({ ...DEFAULT_CONNECTION, ...connection });
      setEntries(Array.isArray(activity) ? activity : []);
    });
    function onStorage(changes: Record<string, chrome.storage.StorageChange>, area: string) {
      if (area === "local" && changes.activity) {
        setEntries(Array.isArray(changes.activity.newValue) ? changes.activity.newValue : []);
      }
    }
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);

  function checkConnection(next: ConnectionSettings) {
    setFeedback("");
    void chrome.storage.local.set({ connection: { ...next, cliPath: next.cliPath.trim() } }).then(onReconnect)
      .catch(() => setFeedback("Không thể lưu cấu hình kết nối."));
  }

  function addPrompt(event: React.FormEvent) {
    event.preventDefault();
    const command = "/" + customCommand.trim().replace(/^\/+/, "").toLowerCase();
    if (!/^\/[\p{L}\p{N}_-]{1,24}$/u.test(command) || !customText.trim()) {
      setFeedback("Nhập tên lệnh liền chữ và nội dung lời nhắc.");
      return;
    }
    const existing = settings.customPrompts.find((prompt) => prompt.command === command);
    if (settings.customPrompts.length >= 10 && !existing) {
      setFeedback("Bạn có thể lưu tối đa 10 lệnh cá nhân.");
      return;
    }
    onSave({ ...settings, customPrompts: [
      ...settings.customPrompts.filter((prompt) => prompt.command !== command),
      { id: existing?.id ?? crypto.randomUUID(), command, label: command.slice(1), template: customText.trim() },
    ] });
    setCustomCommand("");
    setCustomText("");
    setFeedback("");
  }

  return (
    <div className="settings">
      <h1>Cài đặt</h1>
      <section className="settings-section" aria-labelledby="connection-title">
        <div className="section-head">
          <h2 id="connection-title">Kết nối Antigravity</h2>
          <span className={`status-badge ${status.phase === "ready" || isMcpOnlyReady ? "ready" : status.phase}`} role="status">
            <span className={`dot ${status.phase === "ready" || isMcpOnlyReady ? "ready" : status.phase}`} />
            {status.phase === "ready"
              ? `${status.backend.toUpperCase()} · v${status.version}`
              : isMcpOnlyReady
                ? "MCP (Desktop)"
                : status.phase === "connecting"
                  ? "Đang kiểm tra…"
                  : "Chưa kết nối"}
          </span>
        </div>

        {status.phase === "error" && (
          <p className="status-detail">
            {isMcpOnlyReady
              ? "Companion đã kết nối cho Antigravity Desktop (MCP). Để chat trực tiếp trên Side Panel, hãy chọn và cấu hình CLI hoặc SDK bên dưới."
              : bridgeError(status.code)}
          </p>
        )}

        <form onSubmit={(event) => { event.preventDefault(); checkConnection(connection); }}>
          <div className="mode-cards" role="radiogroup" aria-label="Chế độ kết nối backend">
            {([
              {
                id: "auto",
                title: "Tự động",
                badge: "Khuyên dùng",
                desc: "Ưu tiên Antigravity CLI, tự động chuyển sang SDK nếu máy chưa cài CLI.",
              },
              {
                id: "cli",
                title: "Antigravity CLI (agy)",
                badge: "Không cần API key",
                desc: "Dùng phiên đăng nhập tài khoản Antigravity cá nhân, hỗ trợ tự động tải danh sách model.",
              },
              {
                id: "sdk",
                title: "Antigravity Python SDK",
                badge: "API key / Vertex AI",
                desc: "Chạy bằng GEMINI_API_KEY hoặc Vertex AI ADC (gcloud) mà không cần cài agy CLI.",
              },
            ] as const).map((option) => {
              const selected = connection.backend === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  className={`mode-card ${selected ? "selected" : ""}`}
                  onClick={() => setConnection({ ...connection, backend: option.id })}
                >
                  <span className="mode-radio" aria-hidden="true" />
                  <span className="mode-body">
                    <span className="mode-title-row">
                      <strong>{option.title}</strong>
                      <span className="mode-pill">{option.badge}</span>
                    </span>
                    <small>{option.desc}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {connection.backend !== "sdk" ? (
            <label className="field-box">
              <span>Đường dẫn <code>agy</code> CLI tùy chỉnh <small className="muted-inline">(không bắt buộc)</small></span>
              <input
                type="text"
                maxLength={1024}
                value={connection.cliPath}
                disabled={busy}
                placeholder={isWindows ? "Để trống để tự tìm (vd: C:\\...\\agy.exe)" : "Để trống để tự tìm (vd: /opt/homebrew/bin/agy)"}
                onChange={(event) => setConnection({ ...connection, cliPath: event.target.value })}
              />
            </label>
          ) : (
            <div className="sdk-guide">
              <strong>Cấu hình xác thực SDK trên máy:</strong>
              <ul>
                <li><strong>Cách 1 (API Key):</strong> Đặt biến môi trường <code>GEMINI_API_KEY</code> rồi mở lại Chrome.</li>
                <li><strong>Cách 2 (Không cần API key · Vertex AI):</strong> Chạy <code>gcloud auth application-default login</code> và đặt <code>GOOGLE_GENAI_USE_VERTEXAI=True</code>, <code>GOOGLE_CLOUD_PROJECT</code>.</li>
              </ul>
              <button
                className="outline-btn"
                type="button"
                onClick={() => copyValue("sdk", installSdkCmd, "lệnh cài companion kèm SDK")}
              >
                {copiedKey === "sdk" ? "Đã sao chép lệnh cài SDK ✓" : "Sao chép lệnh cài kèm SDK"}
              </button>
            </div>
          )}

          <div className="row-actions">
            <button className="primary-btn" disabled={busy || status.phase === "connecting"}>Lưu & kiểm tra kết nối</button>
            <button className="text-btn" type="button" disabled={busy || status.phase === "connecting"} onClick={() => {
              setConnection(DEFAULT_CONNECTION);
              checkConnection(DEFAULT_CONNECTION);
            }}>Đặt lại mặc định</button>
          </div>
        </form>

        <details className="companion-box">
          <summary>Cài đặt / Cập nhật / Gỡ Companion ({isWindows ? "Windows" : "macOS / Linux"})</summary>
          <div className="cmd-group">
            <div className="cmd-head">
              <span>Lệnh cài / cập nhật nhanh</span>
              <button className="text-btn" type="button" onClick={() => copyValue("install", installCmd, "lệnh cài companion")}>
                {copiedKey === "install" ? "Đã chép ✓" : "Sao chép"}
              </button>
            </div>
            <code className="setup-cmd">{installCmd}</code>
          </div>
          <div className="cmd-group">
            <div className="cmd-head">
              <span>Lệnh gỡ companion</span>
              <button className="text-btn" type="button" onClick={() => copyValue("uninstall", uninstallCmd, "lệnh gỡ companion")}>
                {copiedKey === "uninstall" ? "Đã chép ✓" : "Sao chép"}
              </button>
            </div>
            <code className="setup-cmd">{uninstallCmd}</code>
          </div>
          <div className="cmd-group">
            <div className="cmd-head">
              <span>Extension ID</span>
              <button className="text-btn" type="button" onClick={() => copyValue("id", extId, "Extension ID")}>
                {copiedKey === "id" ? "Đã chép ✓" : "Sao chép ID"}
              </button>
            </div>
            <code className="extension-id">{extId}</code>
          </div>
        </details>
      </section>

      <section className="settings-section" aria-labelledby="access-title">
        <h2 id="access-title">Quyền tương tác trình duyệt</h2>
        <p>Cấp quyền 1 lần để Gecko for Antigravity tương tác trực tiếp với các trang web (luôn chặn trang mật khẩu, thanh toán và CAPTCHA).</p>
        <div className="row-actions">
          {grantedSites.includes("https://*/*") && grantedSites.includes("http://*/*") ? (
            <button className="outline-btn" type="button" onClick={() => {
              void chrome.permissions.remove({ origins: ["https://*/*", "http://*/*"] }).then((removed) => {
                onPermissionsChange();
                setFeedback(removed ? "Đã thu hồi quyền tương tác tất cả website." : "Chrome không thể thu hồi quyền này.");
              }).catch(() => setFeedback("Chrome không thể thu hồi quyền này."));
            }}>Thu hồi quyền toàn trình duyệt</button>
          ) : (
            <button className="primary-btn" type="button" onClick={() => {
              void chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] }).then((granted) => {
                onPermissionsChange();
                setFeedback(granted ? "Đã cấp quyền tương tác 1 lần thành công." : "Bạn đã hủy cấp quyền.");
              }).catch(() => setFeedback("Chrome không thể cấp quyền."));
            }}>Cấp quyền tương tác 1 lần</button>
          )}
        </div>
        {grantedSites.length ? <ul className="site-list">
          {grantedSites.map((origin) => <li key={origin}>
            <span>{origin.replace(/\/\*$/, "")}</span>
            <button className="text-btn" onClick={() => {
              void chrome.permissions.remove({ origins: [origin] }).then((removed) => {
                onPermissionsChange();
                setFeedback(removed ? "Đã thu hồi quyền website." : "Chrome không thể thu hồi quyền này.");
              }).catch(() => setFeedback("Chrome không thể thu hồi quyền này."));
            }}>Thu hồi</button>
          </li>)}
        </ul> : <p>Chưa lưu quyền cho website nào.</p>}
      </section>

      <section className="settings-section" aria-labelledby="remote-title">
        <h2 id="remote-title">Điều khiển từ xa từ Antigravity (MCP)</h2>
        <p>Khi side panel đang mở, Antigravity IDE/CLI trên cùng máy có thể gửi lệnh trực tiếp tới Chrome qua local relay bảo mật (chỉ lắng nghe trên <code>127.0.0.1</code> có mã xác thực).</p>
        <details>
          <summary>Xem lệnh chạy MCP server</summary>
          <p>Cấu hình MCP server trong Antigravity trỏ tới lệnh:</p>
          <code className="extension-id">python -m agy_bridge.mcp_server</code>
        </details>
      </section>

      <section className="settings-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">Giao diện và model</h2>
        <label>Giao diện
          <select value={settings.theme} onChange={(event) => onSave({
            ...settings, theme: event.target.value as UserSettings["theme"],
          })}>
            <option value="system">Theo hệ thống</option>
            <option value="light">Sáng</option>
            <option value="dark">Tối</option>
          </select>
        </label>
        <label>Model của Antigravity
          <input type="text" maxLength={100} value={modelInput} placeholder="Mặc định của backend"
            onChange={(event) => setModelInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const trimmed = modelInput.trim();
              if (trimmed.startsWith("-")) {
                setFeedback("Tên model không được bắt đầu bằng dấu '-'.");
                setModelInput(settings.model);
                return;
              }
              if (trimmed !== settings.model) {
                setFeedback("");
                onSave({ ...settings, model: trimmed });
              }
            }} />
        </label>
      </section>

      <section className="settings-section" aria-labelledby="prompts-title">
        <h2 id="prompts-title">Lệnh nhanh cá nhân</h2>
        <form onSubmit={addPrompt}>
          <label>Tên lệnh<input maxLength={25} placeholder="/vietlai" value={customCommand} onChange={(event) => setCustomCommand(event.target.value)} /></label>
          <label>Lời nhắc<textarea rows={2} maxLength={500} value={customText} onChange={(event) => setCustomText(event.target.value)} /></label>
          <button className="outline-btn">Lưu lệnh</button>
        </form>
        <ul className="site-list">
          {settings.customPrompts.map((prompt) => <li key={prompt.id}>
            <span>{prompt.command}</span><button className="text-btn" aria-label={`Xóa ${prompt.command}`}
              onClick={() => onSave({ ...settings, customPrompts: settings.customPrompts.filter((item) => item.id !== prompt.id) })}>Xóa</button>
          </li>)}
        </ul>
      </section>

      <AuditDrawer entries={entries} onClear={() => {
        if (onClearAudit()) setFeedback("Đã yêu cầu xóa nhật ký.");
      }} />
      <p className="muted-note">Gecko for Antigravity · Phiên bản 0.6.0 · Extension độc lập tương thích Antigravity.</p>
      {feedback && <div className="settings-feedback notice" role="status">{feedback}</div>}
    </div>
  );
}
