/**
 * サイドバーコンポーネント。
 *
 * 背景: アカウントセレクター（未読バッジ付き）とラベルナビゲーションを表示。
 * 「すべて」選択でUnified Inbox、個別アカウントでフィルタリング（spec §5.1）。
 * アカウント識別はカラードットで行う（spec §10 Design未決事項あり）。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback } from "react";

export function Sidebar() {
  const accounts = useAccounts((s) => s.accounts);
  const activeAccountId = useAccounts((s) => s.activeAccountId);
  const setActiveAccount = useAccounts((s) => s.setActiveAccount);
  const setActiveAccountFilter = useThreads((s) => s.setActiveAccountId);

  /** アカウント選択時に、accountsストアとthreadsストアの両方を更新する */
  const handleSelectAccount = useCallback(
    (accountId: string | null) => {
      setActiveAccount(accountId);
      setActiveAccountFilter(accountId);
    },
    [setActiveAccount, setActiveAccountFilter],
  );

  const totalUnread = accounts.reduce((sum, a) => sum + a.unreadCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* ロゴ */}
      <div className="p-4 font-bold text-base tracking-tight">
        VantageMail
      </div>

      {/* アカウントセレクター */}
      <nav className="flex-1 overflow-auto">
        {/* Unified Inbox */}
        <button
          type="button"
          onClick={() => handleSelectAccount(null)}
          className={`flex items-center justify-between w-full px-4 py-2 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded text-left ${
            activeAccountId === null ? "bg-[var(--color-bg-selected)]" : "bg-transparent hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          <span>すべての受信トレイ</span>
          {totalUnread > 0 && (
            <span className="text-[11px] text-[var(--color-accent)] font-semibold">
              {totalUnread}
            </span>
          )}
        </button>

        {/* 各アカウント */}
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => handleSelectAccount(account.id)}
            className={`flex items-center justify-between w-full px-4 py-2 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded text-left gap-2 ${
              activeAccountId === account.id ? "bg-[var(--color-bg-selected)]" : "bg-transparent hover:bg-[var(--color-bg-hover)]"
            }`}
          >
            <span className="flex items-center gap-2">
              {/* アカウント識別カラードット */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: account.color }}
              />
              <span className="truncate">
                {account.displayName || account.email}
              </span>
            </span>
            {account.unreadCount > 0 && (
              <span className="text-[11px] text-[var(--color-accent)] font-semibold shrink-0">
                {account.unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* フッター: アカウント追加 */}
      <div className="px-4 py-3 border-t border-[var(--color-border-light)]">
        <button
          type="button"
          className="w-full py-2 bg-transparent border border-dashed border-[var(--color-border)] rounded-md cursor-pointer text-[13px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
        >
          + アカウントを追加
        </button>
      </div>
    </div>
  );
}
