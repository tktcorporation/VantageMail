/**
 * サイドバーコンポーネント（Spark風 Smart Inbox対応）。
 *
 * 背景: Smart Inboxカテゴリフィルタ（すべて/重要/通知/ニュースレター）を
 * 上部に配置し、カテゴリごとの未読カウントを表示する。
 * アカウントセレクターはカテゴリの下に配置。
 * カテゴリとアカウントの両方でフィルタを組み合わせられる。
 *
 * フッターに「設定」ボタンを配置し、アカウント設定画面への遷移をサポートする。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback, useMemo, type MouseEvent } from "react";
import type { SmartCategory } from "@vantagemail/core";
import { matchesCategory } from "@vantagemail/core";

/** カテゴリ定義: 表示名とGmailラベルのマッピング */
const CATEGORIES: { key: SmartCategory; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "people", label: "重要" },
  { key: "notifications", label: "通知" },
  { key: "newsletters", label: "ニュースレター" },
];

interface SidebarProps {
  onAddAccount?: () => void;
  onRemoveAccount?: (accountId: string) => void;
  /** 設定画面の表示/非表示をトグルするコールバック */
  onToggleSettings?: () => void;
  /** 設定画面が現在アクティブかどうか */
  isSettingsActive?: boolean;
}

export function Sidebar({
  onAddAccount,
  onRemoveAccount,
  onToggleSettings,
  isSettingsActive,
}: SidebarProps = {}) {
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
   * matchesCategoryを@vantagemail/coreから使用して重複ロジックを排除。
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
          if (matchesCategory(thread.labelIds, cat.key)) {
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
      <div className="px-5 pt-6 pb-4 font-bold text-base tracking-tight">VantageMail</div>

      {/* Smart Inbox カテゴリフィルタ */}
      <div className="px-3 mb-3">
        <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-tertiary)] font-medium uppercase tracking-wider">
          Smart Inbox
        </div>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setActiveCategory(cat.key)}
            className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded-xl text-left ${
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
      <div className="mx-5 border-t border-[var(--color-border-light)]" />

      {/* アカウントセレクター */}
      <nav className="flex-1 overflow-auto px-3 mt-3">
        <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-tertiary)] font-medium uppercase tracking-wider">
          アカウント
        </div>

        {/* Unified Inbox（すべてのアカウント） */}
        <button
          type="button"
          onClick={() => handleSelectAccount(null)}
          className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded-xl text-left ${
            activeAccountId === null
              ? "bg-[var(--color-bg-selected)] font-medium"
              : "bg-transparent hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          <span>すべてのアカウント</span>
        </button>

        {/* 各アカウント */}
        {accounts.map((account) => (
          <div key={account.id} className="group relative">
            <button
              type="button"
              onClick={() => handleSelectAccount(account.id)}
              className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[13px] text-[var(--color-text)] rounded-xl text-left gap-2 ${
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
                <span className="truncate">{account.displayName || account.email}</span>
              </span>
              {account.unreadCount > 0 && (
                <span className="text-[11px] text-[var(--color-text-tertiary)] font-normal shrink-0">
                  {account.unreadCount}
                </span>
              )}
            </button>
            {/* アカウント削除は設定画面（AccountSettings）から行う */}
          </div>
        ))}
      </nav>

      {/* フッター: 設定（アカウント追加は設定画面に集約） */}
      {onToggleSettings && (
        <div className="px-4 py-4 border-t border-[var(--color-border-light)]">
          <button
            type="button"
            onClick={onToggleSettings}
            aria-pressed={isSettingsActive}
            className={`flex items-center gap-2 w-full px-3 py-2.5 border-none cursor-pointer text-[13px] rounded-xl text-left transition-colors ${
              isSettingsActive
                ? "bg-[var(--color-bg-selected)] font-medium text-[var(--color-text)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>設定</span>
          </button>
        </div>
      )}
    </div>
  );
}
