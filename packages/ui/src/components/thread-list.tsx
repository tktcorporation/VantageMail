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
import { SearchBar } from "./search-bar";

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
      <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
        読み込み中...
      </div>
    );
  }

  if (visibleThreadIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-secondary)] gap-2">
        <span className="text-xl">📭</span>
        <span>受信トレイは空です</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー + 検索バー */}
      <div className="px-3 py-2 border-b border-[var(--color-border-light)] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[13px]">
            受信トレイ
            <span className="ml-2 text-[var(--color-text-secondary)] font-normal">
              {visibleThreadIds.length}
            </span>
          </span>
        </div>
        <SearchBar
          onSearch={(query) => {
            // TODO: Gmail API検索に接続
            console.log("Search:", query);
          }}
          onClear={() => {
            // TODO: 検索結果をクリア
          }}
        />
      </div>

      {/* スレッドリスト */}
      <div className="flex-1 overflow-auto">
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
              className={`flex flex-col w-full px-4 py-3 border-none border-b border-[var(--color-border-light)] cursor-pointer text-left gap-1 transition-colors ${
                isSelected
                  ? "bg-[var(--color-bg-selected)]"
                  : "bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {/* 1行目: 送信者 + 日時 */}
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-2 text-[13px] truncate ${thread.isUnread ? "font-semibold" : "font-normal"}`}>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: accountColor }}
                  />
                  {thread.participants[0] ?? "不明"}
                  {thread.messageCount > 1 && (
                    <span className="text-[var(--color-text-tertiary)] font-normal">
                      ({thread.messageCount})
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)] shrink-0">
                  {formatRelativeTime(thread.lastMessageAt)}
                </span>
              </div>

              {/* 2行目: 件名 */}
              <div className={`text-[13px] truncate ${thread.isUnread ? "font-semibold" : "font-normal"}`}>
                {thread.subject}
              </div>

              {/* 3行目: スニペット */}
              <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
                {thread.snippet}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
