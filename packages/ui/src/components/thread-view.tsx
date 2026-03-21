/**
 * Thread detail view component.
 *
 * Shows the selected thread's messages with sender info, timestamps,
 * and HTML/text bodies. Fetches full message content from the server
 * when a thread is selected.
 */
import { useThreads } from "../hooks/use-store";
import { useAccounts } from "../hooks/use-store";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { useThreadMessages } from "../hooks/use-thread-messages";
import type { Message } from "@vantagemail/core";

function formatDate(date: Date): string {
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Sanitize HTML email body to prevent XSS */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u",
      "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
      "table", "thead", "tbody", "tr", "th", "td",
      "blockquote", "pre", "code", "img", "hr",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "target", "width", "height"],
    ALLOW_DATA_ATTR: false,
  });
}

function MessageItem({ message }: { message: Message }) {
  return (
    <div className="border-b border-[var(--color-border-light)] py-5">
      {/* Sender + date */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">
            {message.from.name || message.from.email}
          </span>
          {message.from.name && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              &lt;{message.from.email}&gt;
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--color-text-tertiary)] shrink-0">
          {formatDate(message.date)}
        </span>
      </div>

      {/* Recipients */}
      {message.to.length > 0 && (
        <div className="text-[11px] text-[var(--color-text-secondary)] mb-3">
          To: {message.to.map((r) => r.name || r.email).join(", ")}
          {message.cc.length > 0 && (
            <> | Cc: {message.cc.map((r) => r.name || r.email).join(", ")}</>
          )}
        </div>
      )}

      {/* Body */}
      {message.bodyHtml ? (
        <div
          className="text-[13px] leading-relaxed [&_a]:text-[var(--color-accent)] [&_a]:underline [&_img]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border)] [&_blockquote]:pl-3 [&_blockquote]:ml-0 [&_blockquote]:text-[var(--color-text-secondary)]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.bodyHtml) }}
        />
      ) : (
        <pre className="text-[13px] leading-relaxed whitespace-pre-wrap font-sans">
          {message.bodyText}
        </pre>
      )}

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.attachments.map((att) => (
            <span
              key={att.id}
              className="px-2 py-1 bg-[var(--color-bg-hover)] rounded text-[11px] text-[var(--color-text-secondary)]"
            >
              {att.filename} ({Math.round(att.size / 1024)}KB)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThreadView() {
  const selectedThreadId = useThreads((s) => s.selectedThreadId);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);
  const accounts = useAccounts((s) => s.accounts);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    for (const accountThreads of Object.values(threadsByAccount)) {
      const thread = accountThreads[selectedThreadId];
      if (thread) return thread;
    }
    return null;
  }, [selectedThreadId, threadsByAccount]);

  const account = useMemo(() => {
    if (!selectedThread) return null;
    return accounts.find((a) => a.id === selectedThread.accountId) ?? null;
  }, [selectedThread, accounts]);

  const { messages, isLoading, error } = useThreadMessages(
    selectedThreadId,
    selectedThread?.accountId ?? null,
  );

  if (!selectedThread) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
        <span className="text-5xl opacity-30 font-bold">V</span>
        <span className="text-base font-semibold text-[var(--color-text)]">
          VantageMail
        </span>
        <span className="text-[13px]">
          メールを選択してください
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Thread header */}
      <div className="p-6 border-b border-[var(--color-border-light)]">
        <div className="flex items-center gap-2 mb-2">
          {account && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: account.color }}
            />
          )}
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            {account?.email}
          </span>
        </div>
        <h1 className="text-xl font-semibold leading-snug">
          {selectedThread.subject}
        </h1>
        <div className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
          {selectedThread.participants.join(", ")} · {selectedThread.messageCount}通
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 px-6">
        {isLoading && (
          <div className="py-8 text-center text-[var(--color-text-secondary)] text-[13px]">
            Loading messages...
          </div>
        )}
        {error && (
          <div className="py-8 text-center text-red-500 text-[13px]">
            Failed to load messages
          </div>
        )}
        {!isLoading && !error && messages.length === 0 && (
          <div className="py-8 text-[var(--color-text-secondary)] text-[13px]">
            {selectedThread.snippet}
          </div>
        )}
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>

      {/* Reply bar — 閲覧優先のため控えめなスタイル */}
      <div className="px-6 py-3 border-t border-[var(--color-border-light)]">
        <button
          type="button"
          className="px-3 py-1.5 bg-transparent border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded cursor-pointer text-[12px] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
        >
          返信
        </button>
      </div>
    </div>
  );
}
