import React from "react";
import { AuditEntry } from "../../shared/protocol";

export function AuditDrawer({ entries, onClear }: { entries: AuditEntry[]; onClear: () => void }) {
  return (
    <section className="settings-section">
      <h2>Hoạt động đính kèm</h2>
      <p>Nhật ký chỉ lưu thời điểm, loại hoạt động và số mục.</p>
      {entries.length > 0 && <ul className="audit-list">
        {entries.slice(0, 20).map((entry) => <li key={entry.id}>
          <time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString("vi-VN")}</time>
          <span>{entry.action === "sent" ? "Gửi" : "Đính kèm"} {entry.count} mục</span>
        </li>)}
      </ul>}
      <button className="outline-btn" onClick={onClear}>Xóa nhật ký</button>
    </section>
  );
}
