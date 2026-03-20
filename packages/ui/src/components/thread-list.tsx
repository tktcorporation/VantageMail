/**
 * スレッドリストコンポーネント。
 *
 * 背景: Unified Inboxのスレッド一覧を表示する中央ペイン。
 * 全アカウントのメールを時系列でインターリーブ表示し、
 * カラードットでアカウント元を視覚的に区別する（spec §5.2）。
 * J/Kキーでのナビゲーションをサポート。
 */
import { useAccounts } from "../hooks/use-store";
import { useThreads } from "../hooks/use-store";
import { useCallback, useEffect, useMemo } from "react";

/** 相対時間表示（例: "3分前", "昨日"） */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export function ThreadList() {
  const visibleThreadIds = useThreads((s) => s.visibleThreadIds);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);
  const selectedThreadId = useThreads((s) => s.selectedThreadId);
  const selectThread = useThreads((s) => s.selectThread);
  const isLoading = useThreads((s) => s.isLoading);
  const accounts = useAccounts((s) => s.accounts);

  /** 全スレッドのフラットマップ（IDで高速検索） */
  const threadMap = useMemo(() => {
    const map = new Map<string, { thread: ReturnType<typeof Object.values<Record<string, any>>>[number]; accountColor: string }>();
    for (const account of accounts) {
      const threads = threadsByAccount[account.id];
      if (!threads) continue;
      for (const thread of Object.values(threads)) {
        map.set(thread.id, { thread, accountColor: account.color });
      }
    }
    return map;
  }, [threadsByAccount, accounts]);

  /** J/Kキーボードナビゲーション */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const currentIdx = selectedThreadId
        ? visibleThreadIds.indexOf(selectedThreadId)
        : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.min(currentIdx + 1, visibleThreadIds.length - 1);
        selectThread(visibleThreadIds[nextIdx] ?? null);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = Math.max(currentIdx - 1, 0);
        selectThread(visibleThreadIds[prevIdx] ?? null);
      }
    },
    [selectedThreadId, visibleThreadIds, selectThread],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--color-text-secondary)",
        }}
      >
        読み込み中...
      </div>
    );
  }

  if (visibleThreadIds.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--color-text-secondary)",
          gap: "var(--space-sm)",
        }}
      >
        <span style={{ fontSize: "var(--text-xl)" }}>📭</span>
        <span>受信トレイは空です</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ヘッダー */}
      <div
        style={{
          padding: "var(--space-md) var(--space-lg)",
          borderBottom: "1px solid var(--color-border-light)",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
        }}
      >
        受信トレイ
        <span
          style={{
            marginLeft: "var(--space-sm)",
            color: "var(--color-text-secondary)",
            fontWeight: 400,
          }}
        >
          {visibleThreadIds.length}
        </span>
      </div>

      {/* スレッドリスト */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {visibleThreadIds.map((threadId) => {
          const entry = threadMap.get(threadId);
          if (!entry) return null;
          const { thread, accountColor } = entry;
          const isSelected = selectedThreadId === threadId;

          return (
            <button
              key={threadId}
              type="button"
              onClick={() => selectThread(threadId)}
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                padding: "var(--space-md) var(--space-lg)",
                background: isSelected
                  ? "var(--color-bg-selected)"
                  : "var(--color-bg)",
                border: "none",
                borderBottom: "1px solid var(--color-border-light)",
                cursor: "pointer",
                textAlign: "left",
                gap: "var(--space-xs)",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = "var(--color-bg)";
              }}
            >
              {/* 1行目: 送信者 + 日時 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-sm)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    fontWeight: thread.isUnread ? 600 : 400,
                    fontSize: "var(--text-sm)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {/* アカウント識別カラードット */}
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: accountColor,
                      flexShrink: 0,
                    }}
                  />
                  {thread.participants[0] ?? "不明"}
                  {thread.messageCount > 1 && (
                    <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>
                      ({thread.messageCount})
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                    flexShrink: 0,
                  }}
                >
                  {formatRelativeTime(thread.lastMessageAt)}
                </span>
              </div>

              {/* 2行目: 件名 */}
              <div
                style={{
                  fontWeight: thread.isUnread ? 600 : 400,
                  fontSize: "var(--text-sm)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {thread.subject}
              </div>

              {/* 3行目: スニペット */}
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {thread.snippet}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
