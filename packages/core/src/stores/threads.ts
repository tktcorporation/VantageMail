/**
 * スレッド（メール一覧）状態のストア。
 *
 * 背景: Unified Inboxの中心となる状態管理。全アカウントのスレッドを
 * 時系列で統合し、ラベルフィルタやSmart Groupingを適用する。
 * Gmail APIから取得したデータを正規化して保持する。
 */
import { createStore } from "zustand/vanilla";
import type { Thread } from "../types/account";

/**
 * Smart Inboxのカテゴリフィルタ。
 * GmailのカテゴリラベルをSparkスタイルの3グループに集約する。
 * - "people": CATEGORY_PERSONAL / IMPORTANT（人からのメール）
 * - "notifications": CATEGORY_UPDATES / CATEGORY_SOCIAL（通知系）
 * - "newsletters": CATEGORY_PROMOTIONS / CATEGORY_FORUMS（ニュースレター・広告）
 * - "all": フィルタなし（全件表示）
 */
export type SmartCategory = "all" | "people" | "notifications" | "newsletters";

/**
 * スレッドのlabelIdsからSmartCategoryに該当するかを判定する。
 * "all"は常にtrue。
 */
export function matchesCategory(labelIds: readonly string[], category: SmartCategory): boolean {
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

export interface ThreadsState {
  /** accountId -> threadId -> Thread のマップ */
  threadsByAccount: Record<string, Record<string, Thread>>;
  /** 現在表示中のスレッドIDリスト（ソート済み） */
  visibleThreadIds: string[];
  /** 選択中のスレッドID */
  selectedThreadId: string | null;
  /** フィルタ中のラベル */
  activeLabel: string | null;
  /** フィルタ中のアカウントID（nullで全アカウント = Unified Inbox） */
  activeAccountId: string | null;
  /** Smart Inboxのアクティブカテゴリ（"all"でフィルタなし） */
  activeCategory: SmartCategory;
  /** ロード中フラグ */
  isLoading: boolean;
  /**
   * 追加ページ読み込み中フラグ。
   * isLoading とは分離し、スクロール中に全画面ローディングが出るのを防ぐ。
   */
  isLoadingMore: boolean;
  /**
   * アカウントごとの次ページトークン。
   * undefined のとき「もうページがない」ことを意味する（Gmail API の仕様に準拠）。
   */
  pageTokenByAccount: Record<string, string | undefined>;
}

export interface ThreadsActions {
  setThreads: (accountId: string, threads: Thread[], nextPageToken?: string) => void;
  selectThread: (threadId: string | null) => void;
  setActiveLabel: (label: string | null) => void;
  /** アカウントフィルタを設定する。nullでUnified Inbox（全アカウント表示） */
  setActiveAccountId: (accountId: string | null) => void;
  /** Smart Inboxのカテゴリフィルタを設定する */
  setActiveCategory: (category: SmartCategory) => void;
  setLoading: (loading: boolean) => void;
  /** スレッドのラベルを更新（アーカイブ、ゴミ箱等で使用） */
  updateThreadLabels: (accountId: string, threadId: string, labelIds: string[]) => void;
  /** スレッドのスター状態をトグル */
  toggleStar: (accountId: string, threadId: string) => void;
  /**
   * 追加ページのスレッドを既存に結合する（無限スクロール用）。
   * setThreads と異なり既存スレッドを消さずにマージする。
   */
  appendThreads: (accountId: string, threads: Thread[], nextPageToken?: string) => void;
  setLoadingMore: (loading: boolean) => void;
  setPageToken: (accountId: string, token: string | undefined) => void;
}

export type ThreadsStore = ThreadsState & ThreadsActions;

/**
 * 全アカウントのスレッドを時系列でソートし、フラットなIDリストを返す。
 * Unified Inboxの表示順を決定する。
 */
function computeVisibleThreadIds(
  threadsByAccount: Record<string, Record<string, Thread>>,
  activeLabel: string | null,
  activeAccountId: string | null,
  activeCategory: SmartCategory = "all",
): string[] {
  const allThreads: Thread[] = [];
  for (const [accountId, threads] of Object.entries(threadsByAccount)) {
    // アカウントフィルタ: 特定アカウント選択時はそのアカウントのみ表示
    if (activeAccountId && accountId !== activeAccountId) continue;
    for (const thread of Object.values(threads)) {
      if (activeLabel && !thread.labelIds.includes(activeLabel)) continue;
      // Smart Inboxカテゴリフィルタ
      if (!matchesCategory(thread.labelIds, activeCategory)) continue;
      allThreads.push(thread);
    }
  }

  // ピン留め → 最新メッセージ日時の降順でソート
  allThreads.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  return allThreads.map((t) => t.id);
}

export const createThreadsStore = () =>
  createStore<ThreadsStore>((set, get) => ({
    threadsByAccount: {},
    visibleThreadIds: [],
    selectedThreadId: null,
    activeLabel: null,
    activeAccountId: null,
    activeCategory: "all",
    isLoading: false,
    isLoadingMore: false,
    pageTokenByAccount: {},

    setThreads: (accountId, threads, nextPageToken) =>
      set((state) => {
        const threadsMap: Record<string, Thread> = {};
        for (const t of threads) {
          threadsMap[t.id] = t;
        }
        const newByAccount = {
          ...state.threadsByAccount,
          [accountId]: threadsMap,
        };
        return {
          threadsByAccount: newByAccount,
          visibleThreadIds: computeVisibleThreadIds(
            newByAccount,
            state.activeLabel,
            state.activeAccountId,
            state.activeCategory,
          ),
          pageTokenByAccount: {
            ...state.pageTokenByAccount,
            [accountId]: nextPageToken,
          },
        };
      }),

    selectThread: (threadId) => set({ selectedThreadId: threadId }),

    setActiveLabel: (label) =>
      set((state) => ({
        activeLabel: label,
        visibleThreadIds: computeVisibleThreadIds(
          state.threadsByAccount,
          label,
          state.activeAccountId,
          state.activeCategory,
        ),
      })),

    setActiveAccountId: (accountId) =>
      set((state) => ({
        activeAccountId: accountId,
        visibleThreadIds: computeVisibleThreadIds(
          state.threadsByAccount,
          state.activeLabel,
          accountId,
          state.activeCategory,
        ),
      })),

    setActiveCategory: (category) =>
      set((state) => ({
        activeCategory: category,
        visibleThreadIds: computeVisibleThreadIds(
          state.threadsByAccount,
          state.activeLabel,
          state.activeAccountId,
          category,
        ),
      })),

    setLoading: (loading) => set({ isLoading: loading }),

    updateThreadLabels: (accountId, threadId, labelIds) =>
      set((state) => {
        const accountThreads = state.threadsByAccount[accountId];
        if (!accountThreads?.[threadId]) return state;
        const updated = {
          ...state.threadsByAccount,
          [accountId]: {
            ...accountThreads,
            [threadId]: { ...accountThreads[threadId], labelIds },
          },
        };
        return {
          threadsByAccount: updated,
          visibleThreadIds: computeVisibleThreadIds(
            updated,
            state.activeLabel,
            state.activeAccountId,
            state.activeCategory,
          ),
        };
      }),

    toggleStar: (accountId, threadId) =>
      set((state) => {
        const accountThreads = state.threadsByAccount[accountId];
        if (!accountThreads?.[threadId]) return state;
        const thread = accountThreads[threadId];
        return {
          threadsByAccount: {
            ...state.threadsByAccount,
            [accountId]: {
              ...accountThreads,
              [threadId]: { ...thread, isStarred: !thread.isStarred },
            },
          },
        };
      }),

    appendThreads: (accountId, threads, nextPageToken) =>
      set((state) => {
        const existing = state.threadsByAccount[accountId] ?? {};
        const merged = { ...existing };
        for (const t of threads) {
          merged[t.id] = t;
        }
        const newByAccount = {
          ...state.threadsByAccount,
          [accountId]: merged,
        };
        return {
          threadsByAccount: newByAccount,
          visibleThreadIds: computeVisibleThreadIds(
            newByAccount,
            state.activeLabel,
            state.activeAccountId,
            state.activeCategory,
          ),
          pageTokenByAccount: {
            ...state.pageTokenByAccount,
            [accountId]: nextPageToken,
          },
        };
      }),

    setLoadingMore: (loading) => set({ isLoadingMore: loading }),

    setPageToken: (accountId, token) =>
      set((state) => ({
        pageTokenByAccount: {
          ...state.pageTokenByAccount,
          [accountId]: token,
        },
      })),
  }));
