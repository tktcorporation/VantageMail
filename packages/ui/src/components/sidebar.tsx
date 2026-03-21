/**
 * サイドバーコンポーネント（Spark風 Smart Inbox対応）。
 *
 * 背景: Smart Inboxカテゴリフィルタ（すべて/重要/通知/ニュースレター）を
 * 上部に配置し、カテゴリごとの未読カウントを表示する。
 * アカウントセレクターはカテゴリの下に配置。
 * カテゴリとアカウントの両方でフィルタを組み合わせられる。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback, useMemo, type MouseEvent } from "react";
import type { SmartCategory } from "@vantagemail/core";

/** カテゴリ定義: 表示名とGmailラベルのマッピング */
const CATEGORIES: { key: SmartCategory; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "people", label: "重要" },
  { key: "notifications", label: "通知" },
  { key: "newsletters", label: "ニュースレター" },
];

/**
 * スレッドのlabelIdsがカテゴリに該当するか判定する。
 * サイドバーの未読カウント計算に使用。
 */
function threadMatchesCategory(labelIds: readonly string[], category: SmartCategory): boolean {
  if (category === "all") return true;
  switch (category) {
    case "people":
      return labelIds.some((l) => l === "CATEGORY_PERSONAL" || l === "IMPORTANT");
    case "notifications":
      return labelIds.some((l) => l === "CATEGORY_UPDATES" || l === "CATEGORY_SOCIAL");
    case "newsletters":
      return labelIds.some((l) => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_FORUMS");
  }
}

interface SidebarProps {
  onAddAccount?: () => void;
  onRemoveAccount?: (accountId: string) => void;
}

export function Sidebar({ onAddAccount, onRemoveAccount }: SidebarProps = {}) {
  const accounts = useAccounts((s) => s.accounts);
  const activeAccountId = useAccounts((s) => s.activeAccountId);
  const setActiveAccount = useAccounts((s) => s.setActiveAccount);
  const setActiveAccountFilter = useThreads((s) => s.setActiveAccountId);
  const activeCategory = useThreads((s) => s.activeCategory);
  const setActiveCategory = useThreads((s) => s.setActiveCategory);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);

  /** アカウント選択時に、accountsストアとthreadsストアの両方を更新する */
  const handleSelectAccount = useCallback(
    (accountId: string | null) => {
      setActiveAccount(accountId);
      setActiveAccountFilter(accountId);
    },
    [setActiveAccount, setActiveAccountFilter],
  );

  /**
   * カテゴリごとの未読スレッド数を計算する。
   * activeAccountIdが設定されている場合、そのアカウントのみカウントする。
   */
  const categoryCounts = useMemo(() => {
    const counts: Record<SmartCategory, number> = {
      all: 0,
      people: 0,
      notifications: 0,
      newsletters: 0,
    };
    for (const [accountId, threads] of Object.entries(threadsByAccount)) {
      if (activeAccountId && accountId !== activeAccountId) continue;
      for (const thread of Object.values(threads)) {
        if (!thread.isUnread) continue;
        for (const cat of CATEGORIES) {
          if (threadMatchesCategory(thread.labelIds, cat.key)) {
            counts[cat.key]++;
          }
        }
      }
    }
    return counts;
  }, [threadsByAccount, activeAccountId]);

  return (
    <div className="flex flex-col h-full">
      {/* ロゴ */}
      <div className="p-4 font-bold text-base tracking-tight">
        VantageMail
      </div>

      {/* Smart Inbox カテゴリフィルタ */}
      <div className="px-2 mb-2">
        <div className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] font-medium uppercase tracking-wider">
          Smart Inbox
        </div>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCategory(cat.key)}
            className={`flex items-center justify-between w-full px-3 py-1.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded text-left ${
              activeCategory === cat.key
                ? "bg-[var(--color-bg-selected)] font-medium"
                : "bg-transparent hover:bg-[var(--color-bg-hover)]"
            }`}
          >
            <span>{cat.label}</span>
            {categoryCounts[cat.key] > 0 && (
              <span className="text-[11px] text-[var(--color-text-tertiary)] font-normal">
                {categoryCounts[cat.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 区切り線 */}
      <div className="mx-4 border-t border-[var(--color-border-light)]" />

      {/* アカウントセレクター */}
      <nav className="flex-1 overflow-auto px-2 mt-2">
        <div className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)] font-medium uppercase tracking-wider">
          アカウント
        </div>

        {/* Unified Inbox（すべてのアカウント） */}
        <button
          type="button"
          onClick={() => handleSelectAccount(null)}
          className={`flex items-center justify-between w-full px-3 py-1.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded text-left ${
            activeAccountId === null
              ? "bg-[var(--color-bg-selected)] font-medium"
              : "bg-transparent hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          <span>すべてのアカウント</span>
        </button>

        {/* 各アカウント */}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => handleSelectAccount(account.id)}
              className={`flex items-center justify-between w-full px-3 py-1.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded text-left gap-2 ${
                activeAccountId === account.id
                  ? "bg-[var(--color-bg-selected)] font-medium"
                  : "bg-transparent hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
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
                <span className="text-[11px] text-[var(--color-text-tertiary)] font-normal shrink-0">
                  {account.unreadCount}
                </span>
              )}
            </button>
            {/* ホバー時にアカウント削除ボタンを表示 */}
            {onRemoveAccount && (
              <button
                type="button"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  if (confirm(`${account.email} の連携を解除しますか？`)) {
                    onRemoveAccount(account.id);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-danger,#fa5252)] hover:bg-[var(--color-bg-hover)] transition-opacity border-none bg-transparent cursor-pointer"
                title="アカウント連携を解除"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* フッター: アカウント追加 */}
      <div className="px-4 py-3 border-t border-[var(--color-border-light)]">
        <button
          type="button"
          onClick={onAddAccount}
          className="w-full py-2 bg-transparent border border-dashed border-[var(--color-border)] rounded-md cursor-pointer text-[13px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
        >
          + アカウントを追加
        </button>
      </div>
    </div>
  );
}
