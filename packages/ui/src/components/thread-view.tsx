/**
 * スレッド詳細ビューコンポーネント。
 *
 * 背景: 選択されたスレッドのメッセージを表示する右ペイン。
 * 個別メッセージの折りたたみ/展開、インライン添付ファイル表示を行う。
 * 5通以上のスレッドはデフォルト折りたたみ（spec §5.2）。
 */
import { useThreads } from "../hooks/use-store";
import { useAccounts } from "../hooks/use-store";
import { useMemo } from "react";

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

  if (!selectedThread) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
        <span className="text-5xl opacity-30 font-bold">V</span>
        <span className="text-base font-semibold text-[var(--color-text)]">
          VantageMail
        </span>
        <span className="text-[13px]">
          Gmail アカウントを追加して始めましょう
        </span>
        <span className="text-[11px]">
          Cmd+K でコマンドパレットを開く
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* スレッドヘッダー */}
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

      {/* メッセージ本文 */}
      <div className="flex-1 p-6 text-[var(--color-text-secondary)] text-[13px]">
        {/* TODO: Gmail APIからメッセージ本文を取得して表示する */}
        <p>{selectedThread.snippet}</p>
      </div>

      {/* 返信バー */}
      <div className="px-6 py-4 border-t border-[var(--color-border-light)]">
        <button
          type="button"
          className="px-4 py-2 bg-[var(--color-accent)] text-white border-none rounded-md cursor-pointer text-[13px] font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          返信
        </button>
      </div>
    </div>
  );
}
