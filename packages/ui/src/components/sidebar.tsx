/**
 * サイドバーコンポーネント（Spark風 Smart Inbox対応）。
 *
 * 背景: Smart Inboxカテゴリフィルタ（すべて/重要/通知/ニュースレター）を
 * 上部に配置し、カテゴリごとの未読カウントを表示する。
 * アカウントセレクターはカテゴリの下に配置。
 *
 * Lucide Reactアイコンで視覚的なアクセントを付け、
 * Emojiを排除してプロフェッショナルな印象に。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback, useMemo } from "react";
import type { SmartCategory } from "@vantagemail/core";
import { matchesCategory } from "@vantagemail/core";
import { Inbox, Mail, Bell, Newspaper, Settings, Users } from "lucide-react";

/**
 * カテゴリ定義: 表示名、Lucideアイコン、GmailラベルのマッピングGmailラベルのマッピング。
 * 各カテゴリにアイコンを紐付け、サイドバーでの視認性を高める。
 */
const CATEGORIES: {
  key: SmartCategory;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "all", label: "すべて", Icon: Inbox },
  { key: "people", label: "重要", Icon: Mail },
  { key: "notifications", label: "通知", Icon: Bell },
  { key: "newsletters", label: "ニュースレター", Icon: Newspaper },
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
      {/* ロゴ: シンプルなテキストロゴ。letter-spacing で洗練された印象に */}
      <div className="px-5 pt-6 pb-4 font-bold text-[17px] md:text-base tracking-tight text-[var(--color-text)]">
        VantageMail
      </div>

      {/* Smart Inbox カテゴリフィルタ */}
      <div className="px-3 mb-3">
        <div className="px-3 py-1.5 text-[12px] md:text-[11px] text-[var(--color-text-tertiary)] font-medium tracking-wide">
          Smart Inbox
        </div>
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          const Icon = cat.Icon;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[15px] md:text-[13px] text-[var(--color-text)] rounded-xl text-left transition-colors ${
                isActive
                  ? "bg-[var(--color-bg-selected)] font-medium"
                  : "bg-transparent hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  size={16}
                  className={
                    isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                  }
                />
                <span>{cat.label}</span>
              </span>
              {categoryCounts[cat.key] > 0 && (
                <span
                  className={`text-[12px] md:text-[11px] font-normal min-w-[20px] text-center ${
                    isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {categoryCounts[cat.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 区切り線 */}
      <div className="mx-5 border-t border-[var(--color-border-light)]" />

      {/* アカウントセレクター */}
      <nav className="flex-1 overflow-auto px-3 mt-3">
        <div className="px-3 py-1.5 text-[12px] md:text-[11px] text-[var(--color-text-tertiary)] font-medium tracking-wide">
          アカウント
        </div>

        {/* Unified Inbox（すべてのアカウント） */}
        <button
          type="button"
          onClick={() => handleSelectAccount(null)}
          className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[15px] md:text-[13px] text-[var(--color-text)] rounded-xl text-left transition-colors ${
            activeAccountId === null
              ? "bg-[var(--color-bg-selected)] font-medium"
              : "bg-transparent hover:bg-[var(--color-bg-hover)]"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Users
              size={16}
              className={
                activeAccountId === null
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)]"
              }
            />
            <span>すべてのアカウント</span>
          </span>
        </button>

        {/* 各アカウント */}
        {accounts.map((account) => (
          <div key={account.id} className="group relative">
            <button
              type="button"
              onClick={() => handleSelectAccount(account.id)}
              className={`flex items-center justify-between w-full px-3 py-2.5 border-none cursor-pointer text-[15px] md:text-[13px] text-[var(--color-text)] rounded-xl text-left gap-2 transition-colors ${
                activeAccountId === account.id
                  ? "bg-[var(--color-bg-selected)] font-medium"
                  : "bg-transparent hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {/* アカウント識別カラードット */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: account.color }}
                />
                <span className="truncate">{account.displayName || account.email}</span>
              </span>
              {account.unreadCount > 0 && (
                <span className="text-[12px] md:text-[11px] text-[var(--color-text-tertiary)] font-normal shrink-0">
                  {account.unreadCount}
                </span>
              )}
            </button>
          </div>
        ))}
      </nav>

      {/* フッター: 設定 */}
      {onToggleSettings && (
        <div className="px-4 py-4 border-t border-[var(--color-border-light)]">
          <button
            type="button"
            onClick={onToggleSettings}
            aria-pressed={isSettingsActive}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 border-none cursor-pointer text-[15px] md:text-[13px] rounded-xl text-left transition-colors ${
              isSettingsActive
                ? "bg-[var(--color-bg-selected)] font-medium text-[var(--color-text)]"
                : "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            <Settings
              size={16}
              className={
                isSettingsActive
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)]"
              }
            />
            <span>設定</span>
          </button>
        </div>
      )}
    </div>
  );
}
