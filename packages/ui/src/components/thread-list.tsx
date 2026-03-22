/**
 * スレッドリストコンポーネント。
 *
 * 背景: Unified Inboxのスレッド一覧を表示する中央ペイン。
 * 全アカウントのメールを時系列でインターリーブ表示し、
 * カラードットでアカウント元を視覚的に区別する（spec §5.2）。
 * J/Kキーでのナビゲーションをサポート。
 *
 * activeCategory === "all" のとき、Spark風にカテゴリごとのカード表示に切り替わる。
 * カテゴリごとに最大3件のスレッドを表示し、「すべて表示」で該当カテゴリに遷移する。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback, useEffect, useMemo } from "react";
import { SearchBar } from "./search-bar";
import type { Thread, SmartCategory } from "@vantagemail/core";
import { matchesCategory } from "@vantagemail/core";

/** SmartCategoryをUIに表示するための日本語名マッピング */
const CATEGORY_DISPLAY_NAMES: Record<SmartCategory, string> = {
  all: "すべて",
  people: "重要",
  notifications: "通知",
  newsletters: "ニュースレター",
};

/**
 * カテゴリカードの定義。
 * activeCategory === "all" のときに表示するカード群の順序とラベル。
 */
const CATEGORY_CARDS = [
  { key: "people" as const, label: "重要", icon: "✉" },
  { key: "notifications" as const, label: "サービス通知", icon: "🔔" },
  { key: "newsletters" as const, label: "メールマガジン", icon: "📰" },
];

/** カードごとに表示するスレッドの最大数 */
const MAX_ITEMS_PER_CARD = 3;

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

/**
 * 個別スレッド行の表示。ThreadListとCategoryCardの両方で再利用する。
 *
 * 背景: Spark風カード表示でもフラットリスト表示でも同一のスレッド行を使いたいため、
 * 再利用可能なサブコンポーネントとして切り出した。
 */
interface ThreadItemProps {
  thread: Thread;
  accountColor: string;
  isSelected: boolean;
  onSelect: (threadId: string) => void;
}

function ThreadItem({ thread, accountColor, isSelected, onSelect }: ThreadItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className={`relative flex flex-col w-full px-5 py-4 border-0 border-b border-solid border-[var(--color-border-light)] cursor-pointer text-left gap-1.5 transition-colors ${
        isSelected
          ? "bg-[var(--color-bg-selected)]"
          : "bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)]"
      }`}
    >
      {/* 未読インジケーター: 左端の accent 色バー */}
      {thread.isUnread && (
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-accent)]" />
      )}

      {/* 1行目: 送信者 + スター + 日時 */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex items-center gap-2 text-[13px] truncate ${thread.isUnread ? "font-semibold" : "font-normal"}`}
        >
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
        <span className="flex items-center gap-1.5 shrink-0">
          {thread.isStarred && (
            <span className="text-[var(--color-warning,#e67700)] text-[12px]">★</span>
          )}
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
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
}

/**
 * カテゴリカードの表示コンポーネント。
 *
 * 背景: activeCategory === "all" のとき、カテゴリごとにカードを表示する。
 * 各カードにはそのカテゴリのスレッドを最大3件表示し、
 * 「すべて表示 (N)」リンクでカテゴリのフラットリストに遷移する。
 */
interface CategoryCardProps {
  icon: string;
  label: string;
  threads: { thread: Thread; accountColor: string }[];
  totalCount: number;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onShowAll: () => void;
}

function CategoryCard({
  icon,
  label,
  threads,
  totalCount,
  selectedThreadId,
  onSelectThread,
  onShowAll,
}: CategoryCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border-light)] overflow-hidden mb-4">
      {/* カードヘッダー */}
      <div className="px-5 py-3 bg-[var(--color-bg-secondary)] text-[13px] font-semibold flex items-center gap-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>

      {/* スレッド一覧（最大3件） */}
      <div>
        {threads.map(({ thread, accountColor }) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            accountColor={accountColor}
            isSelected={selectedThreadId === thread.id}
            onSelect={onSelectThread}
          />
        ))}
      </div>

      {/* 「すべて表示」リンク */}
      <button
        type="button"
        onClick={onShowAll}
        className="w-full px-5 py-3 border-0 border-t border-solid border-[var(--color-border-light)] bg-transparent cursor-pointer text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] transition-colors text-left"
      >
        すべて表示 ({totalCount})
      </button>
    </div>
  );
}

interface ThreadListProps {
  /** モバイルでサイドバーを開くコールバック */
  onOpenSidebar?: () => void;
}

export function ThreadList({ onOpenSidebar }: ThreadListProps = {}) {
  const visibleThreadIds = useThreads((s) => s.visibleThreadIds);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);
  const selectedThreadId = useThreads((s) => s.selectedThreadId);
  const selectThread = useThreads((s) => s.selectThread);
  const isLoading = useThreads((s) => s.isLoading);
  const activeCategory = useThreads((s) => s.activeCategory);
  const setActiveCategory = useThreads((s) => s.setActiveCategory);
  const activeAccountId = useThreads((s) => s.activeAccountId);
  const accounts = useAccounts((s) => s.accounts);

  const threadMap = useMemo(() => {
    const map = new Map<string, { thread: Thread; accountColor: string }>();
    for (const account of accounts) {
      const threads = threadsByAccount[account.id];
      if (!threads) continue;
      for (const thread of Object.values(threads)) {
        map.set(thread.id, { thread, accountColor: account.color });
      }
    }
    return map;
  }, [threadsByAccount, accounts]);

  /**
   * カテゴリ別にグループ化されたスレッドデータ。
   * activeCategory === "all" のときにカード表示に使う。
   *
   * visibleThreadIds（ストアでソート・フィルタ済み）から導出することで、
   * activeLabel や activeAccountId のフィルタが自動的に反映される。
   * ストアのソートロジックとの重複も排除。
   */
  const categoryGroups = useMemo(() => {
    if (activeCategory !== "all") return null;

    const allEntries = visibleThreadIds
      .map((id) => threadMap.get(id))
      .filter((e): e is { thread: Thread; accountColor: string } => e != null);

    return CATEGORY_CARDS.map((card) => {
      const matching = allEntries.filter((e) => matchesCategory(e.thread.labelIds, card.key));
      return {
        ...card,
        threads: matching.slice(0, MAX_ITEMS_PER_CARD),
        totalCount: matching.length,
      };
    }).filter((group) => group.totalCount > 0);
  }, [activeCategory, visibleThreadIds, threadMap]);

  /**
   * J/Kナビゲーション用のフラットなスレッドIDリスト。
   * カード表示時はカード内のスレッドを順にフラット化する。
   * フラットリスト表示時は従来の visibleThreadIds をそのまま使う。
   */
  const navigableThreadIds = useMemo(() => {
    if (!categoryGroups) return visibleThreadIds;
    const ids: string[] = [];
    for (const group of categoryGroups) {
      for (const { thread } of group.threads) {
        ids.push(thread.id);
      }
    }
    return ids;
  }, [categoryGroups, visibleThreadIds]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const currentIdx = selectedThreadId ? navigableThreadIds.indexOf(selectedThreadId) : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.min(currentIdx + 1, navigableThreadIds.length - 1);
        selectThread(navigableThreadIds[nextIdx] ?? null);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = Math.max(currentIdx - 1, 0);
        selectThread(navigableThreadIds[prevIdx] ?? null);
      }
    },
    [selectedThreadId, navigableThreadIds, selectThread],
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

  if (visibleThreadIds.length === 0 && !categoryGroups?.length) {
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
      <div className="px-5 py-4 border-b border-[var(--color-border-light)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-[14px]">
            {/* モバイル: ハンバーガーメニューボタン */}
            {onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className="md:hidden flex items-center justify-center w-7 h-7 border-none bg-transparent cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded hover:bg-[var(--color-bg-hover)] transition-colors"
                aria-label="メニューを開く"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            {CATEGORY_DISPLAY_NAMES[activeCategory]}
            <span className="text-[var(--color-text-secondary)] font-normal">
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

      {/* スレッドリスト: カード表示 or フラットリスト */}
      <div className="flex-1 overflow-auto">
        {categoryGroups ? (
          /* Spark風カテゴリカード表示（activeCategory === "all" のとき） */
          <div className="p-4">
            {categoryGroups.map((group) => (
              <CategoryCard
                key={group.key}
                icon={group.icon}
                label={group.label}
                threads={group.threads}
                totalCount={group.totalCount}
                selectedThreadId={selectedThreadId}
                onSelectThread={selectThread}
                onShowAll={() => setActiveCategory(group.key)}
              />
            ))}
          </div>
        ) : (
          /* フラットリスト表示（特定カテゴリ選択時） */
          visibleThreadIds.map((threadId) => {
            const entry = threadMap.get(threadId);
            if (!entry) return null;
            return (
              <ThreadItem
                key={threadId}
                thread={entry.thread}
                accountColor={entry.accountColor}
                isSelected={selectedThreadId === threadId}
                onSelect={selectThread}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
