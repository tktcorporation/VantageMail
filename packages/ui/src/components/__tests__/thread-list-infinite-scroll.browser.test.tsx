/**
 * ThreadList 無限スクロールのブラウザテスト。
 *
 * 背景: IntersectionObserver は jsdom で再現できないため、
 * vitest browser mode (Playwright + Chromium) で実ブラウザ上の動作を検証する。
 * sentinel 要素がビューポートに入ったときに onFetchMore が呼ばれること、
 * ロード完了後に sentinel がまだ表示中なら再度呼ばれることを確認する。
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ThreadList } from "../thread-list";
import { StoreContext, type StoreContextValue } from "../../hooks/use-store";
import { createAccountsStore, createThreadsStore } from "@vantagemail/core";
import type { Account, Thread } from "@vantagemail/core";

/**
 * テスト用のモックアカウント。
 * 単一アカウントで十分なため1件のみ。
 */
const MOCK_ACCOUNT: Account = {
  id: "acc-1",
  email: "test@example.com",
  displayName: "Test User",
  color: "#228be6",
  unreadCount: 5,
  notificationsEnabled: true,
};

/** テスト用スレッドを生成する。カテゴリフィルタを通すために INBOX + CATEGORY_PERSONAL を付与。 */
function createMockThread(index: number, accountId: string): Thread {
  return {
    id: `thread-${index}`,
    accountId,
    subject: `テストメール ${index}`,
    snippet: `これはテストメール ${index} のスニペットです`,
    lastMessageAt: new Date(Date.now() - index * 60000),
    participants: [`sender-${index}@example.com`],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_PERSONAL"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  };
}

/**
 * ストアを初期化してThreadListをレンダリングするヘルパー。
 *
 * threads を渡すとストアに設定済みの状態でマウントする。
 * nextPageToken を指定すると「次ページあり」の状態になり、
 * sentinel 要素がレンダリングされる。
 */
function renderThreadList(options: {
  threads?: Thread[];
  nextPageToken?: string;
  onFetchMore?: () => void;
}) {
  const stores: StoreContextValue = {
    accountsStore: createAccountsStore([MOCK_ACCOUNT]),
    threadsStore: createThreadsStore(),
  };

  if (options.threads) {
    stores.threadsStore
      .getState()
      .setThreads(MOCK_ACCOUNT.id, options.threads, options.nextPageToken);
  }

  const result = render(
    <StoreContext.Provider value={stores}>
      <ThreadList onFetchMore={options.onFetchMore} />
    </StoreContext.Provider>,
  );

  return { ...result, stores };
}

/** requestAnimationFrame ベースの待機。ブラウザの描画サイクルを待つ。 */
function waitForRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** IntersectionObserver のコールバックが非同期で発火するのを待つ */
async function waitForIntersection(ms = 200): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ThreadList 無限スクロール", () => {
  afterEach(cleanup);

  it("nextPageToken がある場合、sentinel 要素がレンダリングされる", () => {
    const threads = Array.from({ length: 3 }, (_, i) => createMockThread(i, MOCK_ACCOUNT.id));

    const { container } = renderThreadList({
      threads,
      nextPageToken: "page-2-token",
      onFetchMore: vi.fn(),
    });

    // sentinel: h-1 の div（高さ1pxの透明要素）
    const sentinel = container.querySelector(".h-1");
    expect(sentinel).not.toBeNull();
  });

  it("nextPageToken がない場合、sentinel 要素はレンダリングされない", () => {
    const threads = Array.from({ length: 3 }, (_, i) => createMockThread(i, MOCK_ACCOUNT.id));

    const { container } = renderThreadList({
      threads,
      nextPageToken: undefined,
      onFetchMore: vi.fn(),
    });

    // sentinel がない（hasMore === false）
    const sentinel = container.querySelector(".h-1");
    expect(sentinel).toBeNull();
  });

  it("sentinel がビューポートに表示されると onFetchMore が呼ばれる", async () => {
    const onFetchMore = vi.fn();
    const threads = Array.from({ length: 2 }, (_, i) => createMockThread(i, MOCK_ACCOUNT.id));

    renderThreadList({
      threads,
      nextPageToken: "page-2-token",
      onFetchMore,
    });

    // IntersectionObserver は非同期でコールバックを発火するため待機。
    // コンテンツが少ない場合、sentinel は即座にビューポートに入る。
    await waitForRaf();
    await waitForIntersection();

    expect(onFetchMore).toHaveBeenCalled();
  });

  it("isLoadingMore 中に sentinel が表示されていても、ロード完了後に再度 onFetchMore が呼ばれる", async () => {
    const onFetchMore = vi.fn();
    const threads = Array.from({ length: 2 }, (_, i) => createMockThread(i, MOCK_ACCOUNT.id));

    const { stores } = renderThreadList({
      threads,
      nextPageToken: "page-2-token",
      onFetchMore,
    });

    // 最初のトリガーを待つ
    await waitForRaf();
    await waitForIntersection();

    const firstCallCount = onFetchMore.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // ローディング開始 → 完了をシミュレート（追加スレッドを結合）
    stores.threadsStore.getState().setLoadingMore(true);
    onFetchMore.mockClear();

    // ローディング中は observer が切断されているため呼ばれない
    await waitForRaf();
    await waitForIntersection();
    expect(onFetchMore).not.toHaveBeenCalled();

    // ローディング完了 → observer 再接続で sentinel を再検出
    stores.threadsStore.getState().setLoadingMore(false);
    await waitForRaf();
    await waitForIntersection();

    // 修正後: isLoadingMore が false に戻ると observer が再作成され、
    // sentinel がまだ表示中なら onFetchMore が再トリガーされる
    expect(onFetchMore).toHaveBeenCalled();
  });
});
