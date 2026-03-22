/**
 * スレッドリストコンポーネント（Spark風 Smart Inbox対応）。
 *
 * 背景: Unified Inboxのスレッド一覧を表示する中央ペイン。
 * activeCategory === "all" のとき、Spark風カテゴリカードで表示する。
 *
 * 重要メール（people）はアカウント別に個別カードで表示し、
 * 通知・ニュースレターはアカウント横断で統合表示する（Spark Per Account/Unified混在方式）。
 *
 * 既読メールは下部に低コントラストの「既読」セクションとして表示する。
 * 「すべて表示」はモバイルでフルスクリーンオーバーレイを開く。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchBar } from "./search-bar";
import type { Thread, SmartCategory } from "@vantagemail/core";
import { matchesCategory } from "@vantagemail/core";
import {
  Mail,
  Bell,
  Newspaper,
  Inbox,
  X,
  ChevronRight,
  Star,
  Menu,
  Eye,
} from "lucide-react";

/** SmartCategoryをUIに表示するための日本語名マッピング */
const CATEGORY_DISPLAY_NAMES: Record<SmartCategory, string> = {
  all: "すべて",
  people: "重要",
  notifications: "通知",
  newsletters: "ニュースレター",
};

/**
 * カテゴリカードの定義。
 * Lucide Reactアイコンを使用し、AI感のある絵文字は排除。
 * "people" はアカウント別カード生成のため、ここでは含めない。
 */
const UNIFIED_CATEGORY_CARDS = [
  { key: "notifications" as const, label: "サービス通知", IconComponent: Bell },
  { key: "newsletters" as const, label: "メールマガジン", IconComponent: Newspaper },
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
 * モバイルではフォントサイズを拡大し（15px/13px）、
 * タップターゲットも広めに取る（py-3.5）。
 */
interface ThreadItemProps {
  thread: Thread;
  accountColor: string;
  isSelected: boolean;
  onSelect: (threadId: string) => void;
  /** 既読セクション内で表示する場合、コントラストを下げる */
  dimmed?: boolean;
}

function ThreadItem({ thread, accountColor, isSelected, onSelect, dimmed }: ThreadItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className={`relative flex flex-col w-full px-4 py-3.5 border-0 border-b border-solid border-[var(--color-border-light)] cursor-pointer text-left gap-1 transition-colors ${
        isSelected
          ? "bg-[var(--color-bg-selected)]"
          : "bg-[var(--color-bg)] hover:bg-[var(--color-bg-hover)]"
      } ${dimmed ? "opacity-60" : ""}`}
    >
      {/* 未読インジケーター: 左端の accent 色バー */}
      {thread.isUnread && (
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-accent)]" />
      )}

      {/* 1行目: 送信者 + スター + 日時 */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex items-center gap-2 text-[15px] md:text-[13px] truncate ${thread.isUnread ? "font-semibold text-[var(--color-text)]" : "font-normal text-[var(--color-text-secondary)]"}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accountColor }}
          />
          {thread.participants[0] ?? "不明"}
          {thread.messageCount > 1 && (
            <span className="text-[var(--color-text-tertiary)] font-normal text-[13px] md:text-[11px]">
              ({thread.messageCount})
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {thread.isStarred && (
            <Star size={13} className="text-[var(--color-warning,#e67700)] fill-current" />
          )}
          <span className="text-[12px] md:text-[11px] text-[var(--color-text-tertiary)]">
            {formatRelativeTime(thread.lastMessageAt)}
          </span>
        </span>
      </div>

      {/* 2行目: 件名 */}
      <div
        className={`text-[15px] md:text-[13px] truncate ${thread.isUnread ? "font-medium text-[var(--color-text)]" : "font-normal text-[var(--color-text-secondary)]"}`}
      >
        {thread.subject}
      </div>

      {/* 3行目: スニペット */}
      <div className="text-[13px] md:text-[11px] text-[var(--color-text-tertiary)] truncate leading-snug">
        {thread.snippet}
      </div>
    </button>
  );
}

/**
 * カテゴリカードの表示コンポーネント。
 *
 * Lucide Reactアイコンを使い、カードヘッダーに配色とアイコンで
 * 視覚的なアクセントを付ける。
 * 「すべて表示」はモバイルではフルスクリーンオーバーレイを開く。
 */
interface CategoryCardProps {
  IconComponent: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  /** アカウント名（重要メールのアカウント別表示時に使用） */
  accountLabel?: string;
  accountColor?: string;
  threads: { thread: Thread; accountColor: string }[];
  totalCount: number;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onShowAll: () => void;
}

function CategoryCard({
  IconComponent,
  label,
  accountLabel,
  accountColor,
  threads,
  totalCount,
  selectedThreadId,
  onSelectThread,
  onShowAll,
}: CategoryCardProps) {
  if (threads.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border-light)] overflow-hidden mb-3">
      {/* カードヘッダー */}
      <div className="px-4 py-2.5 bg-[var(--color-bg-secondary)] flex items-center justify-between">
        <span className="flex items-center gap-2 text-[14px] md:text-[13px] font-semibold text-[var(--color-text)]">
          <IconComponent size={15} className="text-[var(--color-text-secondary)]" />
          <span>{label}</span>
          {accountLabel && (
            <>
              <span className="text-[var(--color-text-tertiary)] font-normal">·</span>
              <span className="flex items-center gap-1.5 font-normal text-[13px] md:text-[12px] text-[var(--color-text-secondary)]">
                {accountColor && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: accountColor }}
                  />
                )}
                {accountLabel}
              </span>
            </>
          )}
        </span>
        <span className="text-[12px] md:text-[11px] text-[var(--color-text-tertiary)]">
          {totalCount}
        </span>
      </div>

      {/* スレッド一覧（最大3件） */}
      <div>
        {threads.map(({ thread, accountColor: color }) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            accountColor={color}
            isSelected={selectedThreadId === thread.id}
            onSelect={onSelectThread}
          />
        ))}
      </div>

      {/* 「すべて表示」: カテゴリ全件をオーバーレイで表示 */}
      {totalCount > MAX_ITEMS_PER_CARD && (
        <button
          type="button"
          onClick={onShowAll}
          className="w-full px-4 py-2.5 border-0 border-t border-solid border-[var(--color-border-light)] bg-transparent cursor-pointer text-[13px] md:text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] transition-colors flex items-center justify-between"
        >
          <span>すべて表示</span>
          <ChevronRight size={14} className="text-[var(--color-text-tertiary)]" />
        </button>
      )}
    </div>
  );
}

/**
 * フルスクリーンオーバーレイ。
 *
 * 背景: モバイルで「すべて表示」をタップしたとき、
 * 該当カテゴリの全スレッドをフルスクリーンで表示する。
 * ×ボタンで閉じてカード一覧に戻れる。
 * setActiveCategoryで画面遷移するのではなく、レイヤーとして被せる方式。
 */
interface FullScreenOverlayProps {
  title: string;
  IconComponent: React.ComponentType<{ size?: number; className?: string }>;
  threads: { thread: Thread; accountColor: string }[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
}

function FullScreenOverlay({
  title,
  IconComponent,
  threads,
  selectedThreadId,
  onSelectThread,
  onClose,
}: FullScreenOverlayProps) {
  /* Escape キーで閉じる */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col animate-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        animation: "slideUp 250ms ease-out",
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-light)] bg-[var(--color-bg)]">
        <span className="flex items-center gap-2 font-semibold text-[16px] md:text-[14px] text-[var(--color-text)]">
          <IconComponent size={18} className="text-[var(--color-text-secondary)]" />
          {title}
          <span className="font-normal text-[13px] text-[var(--color-text-tertiary)]">
            {threads.length}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 border-none bg-transparent cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
          aria-label="閉じる"
        >
          <X size={20} />
        </button>
      </div>

      {/* スレッド一覧 */}
      <div className="flex-1 overflow-auto">
        {threads.map(({ thread, accountColor }) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            accountColor={accountColor}
            isSelected={selectedThreadId === thread.id}
            onSelect={(id) => {
              onSelectThread(id);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 既読メールセクション。
 *
 * 背景: 既読メールはカード群の下に、コントラストを1段落として表示する。
 * Sparkの「Seen」カードに相当する。ヘッダーをタップで展開/折りたたみ可能。
 */
interface SeenSectionProps {
  threads: { thread: Thread; accountColor: string }[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

function SeenSection({ threads, selectedThreadId, onSelectThread }: SeenSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (threads.length === 0) return null;

  const displayThreads = isExpanded ? threads : threads.slice(0, 3);

  return (
    <div className="mt-2 mb-4">
      {/* セクションヘッダー */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 py-2.5 border-none bg-transparent cursor-pointer text-[13px] md:text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <Eye size={14} />
          <span>既読メール</span>
          <span className="text-[12px] md:text-[11px]">({threads.length})</span>
        </span>
        <ChevronRight
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
        />
      </button>

      {/* 既読スレッド一覧: 低コントラストで表示 */}
      <div className="border-t border-[var(--color-border-light)]">
        {displayThreads.map(({ thread, accountColor }) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            accountColor={accountColor}
            isSelected={selectedThreadId === thread.id}
            onSelect={onSelectThread}
            dimmed
          />
        ))}
      </div>

      {/* 展開トグル */}
      {!isExpanded && threads.length > 3 && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full px-4 py-2 border-0 border-t border-solid border-[var(--color-border-light)] bg-transparent cursor-pointer text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors text-left"
        >
          さらに {threads.length - 3} 件を表示
        </button>
      )}
    </div>
  );
}

interface ThreadListProps {
  /** モバイルでサイドバーを開くコールバック */
  onOpenSidebar?: () => void;
  /** 次ページのスレッドを取得するコールバック（無限スクロール用） */
  onFetchMore?: () => void;
}

export function ThreadList({ onOpenSidebar, onFetchMore }: ThreadListProps = {}) {
  const visibleThreadIds = useThreads((s) => s.visibleThreadIds);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);
  const selectedThreadId = useThreads((s) => s.selectedThreadId);
  const selectThread = useThreads((s) => s.selectThread);
  const isLoading = useThreads((s) => s.isLoading);
  const isLoadingMore = useThreads((s) => s.isLoadingMore);
  const pageTokenByAccount = useThreads((s) => s.pageTokenByAccount);
  const activeCategory = useThreads((s) => s.activeCategory);
  const setActiveCategory = useThreads((s) => s.setActiveCategory);
  const accounts = useAccounts((s) => s.accounts);

  /**
   * フルスクリーンオーバーレイの表示状態。
   * カテゴリキー + アカウントID（重要メールの場合）で識別する。
   */
  const [overlayState, setOverlayState] = useState<{
    categoryKey: SmartCategory;
    accountId?: string;
    label: string;
    IconComponent: React.ComponentType<{ size?: number; className?: string }>;
  } | null>(null);

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
   *
   * 重要メール（people）: アカウントごとに個別カードを生成。
   * 通知・ニュースレター: 全アカウント統合で1カードずつ。
   * 既読メール: 全カテゴリの既読スレッドを下部にまとめて表示。
   */
  const { peopleCards, unifiedCards, seenThreads } = useMemo(() => {
    if (activeCategory !== "all") {
      return { peopleCards: [], unifiedCards: [], seenThreads: [] };
    }

    const allEntries = visibleThreadIds
      .map((id) => threadMap.get(id))
      .filter((e): e is { thread: Thread; accountColor: string } => e != null);

    /* --- 重要メール: アカウント別にカード分離 --- */
    const peopleByAccount = new Map<string, { thread: Thread; accountColor: string }[]>();
    for (const entry of allEntries) {
      if (!entry.thread.isUnread) continue;
      if (!matchesCategory(entry.thread.labelIds, "people")) continue;
      const accId = entry.thread.accountId;
      if (!peopleByAccount.has(accId)) {
        peopleByAccount.set(accId, []);
      }
      peopleByAccount.get(accId)!.push(entry);
    }

    const pCards = Array.from(peopleByAccount.entries()).map(([accountId, entries]) => {
      const account = accounts.find((a) => a.id === accountId);
      return {
        accountId,
        accountLabel: account?.displayName || account?.email || accountId,
        accountColor: account?.color || "#888",
        threads: entries.slice(0, MAX_ITEMS_PER_CARD),
        allThreads: entries,
        totalCount: entries.length,
      };
    });

    /* --- 通知・ニュースレター: アカウント統合 --- */
    const uCards = UNIFIED_CATEGORY_CARDS.map((card) => {
      const matching = allEntries.filter(
        (e) => e.thread.isUnread && matchesCategory(e.thread.labelIds, card.key),
      );
      return {
        ...card,
        threads: matching.slice(0, MAX_ITEMS_PER_CARD),
        allThreads: matching,
        totalCount: matching.length,
      };
    }).filter((group) => group.totalCount > 0);

    /* --- 既読メール: 全カテゴリの既読スレッドを収集 --- */
    const seen = allEntries.filter((e) => !e.thread.isUnread);

    return { peopleCards: pCards, unifiedCards: uCards, seenThreads: seen };
  }, [activeCategory, visibleThreadIds, threadMap, accounts]);

  /**
   * オーバーレイに表示する全スレッドリスト。
   * overlayState のカテゴリ/アカウントに応じたフィルタリング。
   */
  const overlayThreads = useMemo(() => {
    if (!overlayState) return [];

    const allEntries = visibleThreadIds
      .map((id) => threadMap.get(id))
      .filter((e): e is { thread: Thread; accountColor: string } => e != null);

    return allEntries.filter((e) => {
      if (!e.thread.isUnread) return false;
      if (!matchesCategory(e.thread.labelIds, overlayState.categoryKey)) return false;
      if (overlayState.accountId && e.thread.accountId !== overlayState.accountId) return false;
      return true;
    });
  }, [overlayState, visibleThreadIds, threadMap]);

  /**
   * J/Kナビゲーション用のフラットなスレッドIDリスト。
   */
  const navigableThreadIds = useMemo(() => {
    if (activeCategory !== "all") return visibleThreadIds;
    const ids: string[] = [];
    for (const card of peopleCards) {
      for (const { thread } of card.threads) ids.push(thread.id);
    }
    for (const card of unifiedCards) {
      for (const { thread } of card.threads) ids.push(thread.id);
    }
    for (const { thread } of seenThreads.slice(0, 3)) {
      ids.push(thread.id);
    }
    return ids;
  }, [activeCategory, visibleThreadIds, peopleCards, unifiedCards, seenThreads]);

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

  /**
   * 無限スクロール用 IntersectionObserver。
   *
   * sentinel 要素（リスト末尾の透明div）がビューポートに入ったら
   * onFetchMore を呼び出す。rootMargin: "200px" で末尾到達の200px手前で
   * 先行ロードを開始し、ユーザーにローディングを感じさせない。
   */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = Object.values(pageTokenByAccount).some((t) => t != null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onFetchMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onFetchMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onFetchMore, hasMore]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          <span className="text-[14px] md:text-[13px]">読み込み中...</span>
        </div>
      </div>
    );
  }

  const hasNoMail =
    visibleThreadIds.length === 0 &&
    peopleCards.length === 0 &&
    unifiedCards.length === 0 &&
    seenThreads.length === 0;

  if (hasNoMail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-secondary)] gap-3 px-6">
        <Inbox size={32} strokeWidth={1.5} className="text-[var(--color-text-tertiary)]" />
        <span className="text-[15px] md:text-[14px] font-medium text-[var(--color-text)]">
          受信トレイは空です
        </span>
        <span className="text-[13px] md:text-[12px] text-center leading-relaxed">
          新しいメールが届くとここに表示されます
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー + 検索バー */}
      <div className="px-4 py-3.5 border-b border-[var(--color-border-light)] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-[16px] md:text-[14px]">
            {/* モバイル: ハンバーガーメニューボタン */}
            {onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className="md:hidden flex items-center justify-center w-8 h-8 border-none bg-transparent cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                aria-label="メニューを開く"
              >
                <Menu size={18} />
              </button>
            )}
            {CATEGORY_DISPLAY_NAMES[activeCategory]}
            <span className="text-[var(--color-text-tertiary)] font-normal text-[14px] md:text-[13px]">
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
        {activeCategory === "all" ? (
          /* Spark風カテゴリカード表示 */
          <div className="p-3">
            {/* 重要メール: アカウント別カード */}
            {peopleCards.map((card) => (
              <CategoryCard
                key={`people-${card.accountId}`}
                IconComponent={Mail}
                label="重要"
                accountLabel={card.accountLabel}
                accountColor={card.accountColor}
                threads={card.threads}
                totalCount={card.totalCount}
                selectedThreadId={selectedThreadId}
                onSelectThread={selectThread}
                onShowAll={() =>
                  setOverlayState({
                    categoryKey: "people",
                    accountId: card.accountId,
                    label: `重要 · ${card.accountLabel}`,
                    IconComponent: Mail,
                  })
                }
              />
            ))}

            {/* 通知・ニュースレター: アカウント統合カード */}
            {unifiedCards.map((card) => (
              <CategoryCard
                key={card.key}
                IconComponent={card.IconComponent}
                label={card.label}
                threads={card.threads}
                totalCount={card.totalCount}
                selectedThreadId={selectedThreadId}
                onSelectThread={selectThread}
                onShowAll={() =>
                  setOverlayState({
                    categoryKey: card.key,
                    label: card.label,
                    IconComponent: card.IconComponent,
                  })
                }
              />
            ))}

            {/* 既読メールセクション */}
            <SeenSection
              threads={seenThreads}
              selectedThreadId={selectedThreadId}
              onSelectThread={selectThread}
            />
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

        {/* 無限スクロール: sentinel 要素 + ローディングインジケーター */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          </div>
        )}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
      </div>

      {/* フルスクリーンオーバーレイ: 「すべて表示」で開く */}
      {overlayState && (
        <FullScreenOverlay
          title={overlayState.label}
          IconComponent={overlayState.IconComponent}
          threads={overlayThreads}
          selectedThreadId={selectedThreadId}
          onSelectThread={selectThread}
          onClose={() => setOverlayState(null)}
        />
      )}
    </div>
  );
}
