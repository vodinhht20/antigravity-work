import React, { useEffect, useRef, useState } from "react";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = () => {
    clearTimeout(resetTimer.current);
    void navigator.clipboard.writeText(code).then(() => {
      setCopyState("done");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 1600);
    }).catch(() => {
      setCopyState("error");
      resetTimer.current = setTimeout(() => setCopyState("idle"), 2000);
    });
  };

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span>{lang || "code"}</span>
        <button className="md-copy-btn" onClick={handleCopy}>
          {copyState === "done" ? "Đã chép ✓" : copyState === "error" ? "Thử lại" : "Sao chép"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="md-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
        >
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="md-root">
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          const firstNl = inner.indexOf("\n");
          const lang = firstNl >= 0 ? inner.slice(0, firstNl).trim() : "";
          const code = firstNl >= 0 ? inner.slice(firstNl + 1) : inner;
          return <CodeBlock key={idx} lang={lang} code={code.replace(/\n$/, "")} />;
        }

        const lines = part.split("\n");
        const blocks: React.ReactNode[] = [];
        let listItems: React.ReactNode[] = [];
        let listType: "ul" | "ol" | null = null;

        const flushList = (k: number) => {
          if (!listType || listItems.length === 0) return;
          if (listType === "ul") {
            blocks.push(
              <ul key={`ul-${k}`} className="md-list">
                {listItems}
              </ul>
            );
          } else {
            blocks.push(
              <ol key={`ol-${k}`} className="md-list">
                {listItems}
              </ol>
            );
          }
          listItems = [];
          listType = null;
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();
          const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
          const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);

          if (ulMatch) {
            if (listType === "ol") flushList(lineIdx);
            listType = "ul";
            listItems.push(<li key={lineIdx}>{renderInline(ulMatch[1])}</li>);
            return;
          }
          if (olMatch) {
            if (listType === "ul") flushList(lineIdx);
            listType = "ol";
            listItems.push(<li key={lineIdx}>{renderInline(olMatch[1])}</li>);
            return;
          }

          flushList(lineIdx);
          if (!trimmed) return;

          const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
          if (hMatch) {
            const level = Math.min(hMatch[1].length, 3);
            blocks.push(
              <div key={lineIdx} className={`md-h md-h${level}`}>
                {renderInline(hMatch[2])}
              </div>
            );
          } else {
            blocks.push(
              <p key={lineIdx} className="md-p">
                {renderInline(line)}
              </p>
            );
          }
        });
        flushList(lines.length);

        return <React.Fragment key={idx}>{blocks}</React.Fragment>;
      })}
    </div>
  );
});
