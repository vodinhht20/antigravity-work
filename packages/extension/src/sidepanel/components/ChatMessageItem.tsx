import React, { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../../shared/protocol";
import { MarkdownRenderer } from "./MarkdownRenderer";

export const ChatMessageItem = React.memo(function ChatMessageItem({
  message, streaming = false, toolStatus,
}: { message: ChatMessage; streaming?: boolean; toolStatus?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  function handleCopy() {
    clearTimeout(resetTimer.current);
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopyState("done");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 1600);
    }).catch(() => {
      setCopyState("error");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 2000);
    });
  }

  return (
    <article className={`msg ${message.role}`} aria-label={message.role === "assistant" ? "Gecko for Antigravity" : "Bạn"}>
      {message.role === "assistant" && <div className="message-author">Gecko</div>}
      <div className="bubble">
        {streaming && toolStatus && <div className="tool-status" role="status">⚡ {toolStatus}</div>}
        {message.role === "assistant" && !streaming
          ? <MarkdownRenderer content={message.content} />
          : <div className="user-text">{message.content || (toolStatus ? "" : "Đang chờ Gecko…")}</div>}
        {message.error && <div className="msg-error">{message.error}</div>}
      </div>
      {message.role === "assistant" && message.content && !streaming &&
        <button className="text-btn msg-action-btn" onClick={handleCopy}>
          {copyState === "done" ? "Đã sao chép" : copyState === "error" ? "Thử sao chép lại" : "Sao chép"}
        </button>}
    </article>
  );
});
