import React, { useState } from "react";
import { SavedConversation } from "../../shared/protocol";

interface Props {
  conversations: SavedConversation[];
  activeId: string;
  busy: boolean;
  onSelect: (conversation: SavedConversation) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function HistoryDrawer({ conversations, activeId, busy, onSelect, onDelete, onNewChat }: Props) {
  const [search, setSearch] = useState("");
  const filter = search.trim().toLowerCase();
  const matches = conversations.filter((item) => item.title.toLowerCase().includes(filter));

  return (
    <section className="settings">
      <div className="row-actions"><h1>Lịch sử hội thoại</h1>
        <button className="outline-btn" disabled={busy} onClick={onNewChat}>Hội thoại mới</button>
      </div>
      <label className="history-search"><span className="sr-only">Tìm hội thoại</span>
        <input type="search" placeholder="Tìm hội thoại…" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
      </label>
      {matches.length === 0 && <p className="muted-note">{filter ? "Không tìm thấy cuộc trò chuyện phù hợp." : "Chưa có cuộc trò chuyện đã lưu."}</p>}
      <ul className="history-list">
        {matches.map((item) => <li key={item.id} className={item.id === activeId ? "selected" : ""}>
          <button className="history-entry" disabled={busy} onClick={() => onSelect(item)}>
            <strong>{item.title}</strong>
            <small>{item.messages.length} tin nhắn · {new Date(item.updatedAt).toLocaleDateString("vi-VN")}</small>
          </button>
          <button className="icon-btn" disabled={busy} aria-label={`Xóa hội thoại ${item.title}`} onClick={() => onDelete(item.id)}>×</button>
        </li>)}
      </ul>
    </section>
  );
}
