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
  const [customCommand, setCustomCommand] = useState("");
  const [customText, setCustomText] = useState("");
  const [modelInput, setModelInput] = useState(settings.model);

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
        <h2 id="connection-title">Kết nối Antigravity</h2>
        <p role="status">{status.phase === "ready" ? `Đã kết nối với ${status.backend.toUpperCase()} · companion ${status.version}`
          : status.phase === "connecting" ? "Đang kiểm tra companion…" : bridgeError(status.code)}</p>
        <form onSubmit={(event) => { event.preventDefault(); checkConnection(connection); }}>
          <label>Backend
            <select value={connection.backend} disabled={busy} onChange={(event) =>
              setConnection({ ...connection, backend: event.target.value as ConnectionSettings["backend"] })}>
              <option value="auto">Tự động</option>
              <option value="cli">Antigravity CLI</option>
              <option value="sdk">Antigravity SDK</option>
            </select>
          </label>
          {connection.backend !== "sdk" && <label>Đường dẫn CLI dự phòng
            <input type="text" maxLength={1024} value={connection.cliPath} disabled={busy}
              placeholder={navigator.userAgent.includes("Windows") ? "C:\\…\\agy.exe" : "/usr/local/bin/agy"}
              onChange={(event) => setConnection({ ...connection, cliPath: event.target.value })} />
          </label>}
          <div className="row-actions">
            <button className="primary-btn" disabled={busy || status.phase === "connecting"}>Lưu và thử kết nối</button>
            <button className="text-btn" type="button" disabled={busy || status.phase === "connecting"} onClick={() => {
              setConnection(DEFAULT_CONNECTION);
              checkConnection(DEFAULT_CONNECTION);
            }}>Đặt lại tự động</button>
          </div>
        </form>
        <details>
          <summary>Cài companion trên máy này (1 dòng lệnh)</summary>
          <p>Chạy lệnh 1 dòng từ GitHub <code>vodinhht20/antigravity-work</code> trong {/Windows/i.test(navigator.userAgent) ? "PowerShell" : "Terminal"}:</p>
          <code className="setup-cmd">{/Windows/i.test(navigator.userAgent)
            ? `irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex; Install-Gecko ${chrome.runtime.id}`
            : `curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- ${chrome.runtime.id}`}</code>
          <p>Extension ID</p>
          <div className="row-actions">
            <code className="extension-id">{chrome.runtime.id}</code>
            <button className="text-btn" onClick={() => {
              void navigator.clipboard.writeText(chrome.runtime.id).then(() => setFeedback("Đã sao chép Extension ID."))
                .catch(() => setFeedback("Không thể sao chép tự động."));
            }}>Sao chép ID</button>
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
