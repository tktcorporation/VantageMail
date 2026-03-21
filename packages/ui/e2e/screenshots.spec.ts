/**
 * 各ページ状態のスクリーンショットを撮影する Playwright スクリプト。
 *
 * 背景: UI 改善時に全体感を把握するため、主要な画面状態を自動撮影する。
 * page.route() で API をインターセプトし、フィクスチャのモックデータを返す。
 *
 * 実行: pnpm screenshot
 * 出力: packages/ui/screenshots/
 */
import { test } from "@playwright/test";
import { THREADS, MESSAGES_BY_THREAD, serializeThreads, serializeMessages } from "./fixtures";

const SCREENSHOT_DIR = "screenshots";

/**
 * 全テスト共通: API モックを設定する。
 * /api/threads と /api/threads/:id をインターセプトしてフィクスチャを返す。
 */
test.beforeEach(async ({ page }) => {
  // スレッド詳細 API（先に登録。/api/threads/t1?... にマッチ）
  await page.route(/\/api\/threads\/([^/?]+)/, (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/threads\/([^/?]+)/);
    const threadId = match?.[1];
    const messages = threadId ? (MESSAGES_BY_THREAD[threadId] ?? []) : [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: serializeMessages(messages) }),
    });
  });

  // スレッド一覧 API（/api/threads?accountId=... にマッチ）
  await page.route(/\/api\/threads\?/, (route) => {
    const url = new URL(route.request().url());
    const accountId = url.searchParams.get("accountId");
    const filtered = THREADS.filter((t) => t.accountId === accountId);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: serializeThreads(filtered) }),
    });
  });
});

test("01 - 初期状態（カテゴリ=all、カードビュー）", async ({ page }) => {
  await page.goto("/");
  // スレッドが描画されるのを待つ
  await page.waitForSelector("[data-testid='thread-item']", { timeout: 10_000 }).catch(() => {
    // testid がなくてもスレッドテキストで待つ
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-initial.png`, fullPage: false });
});

test("02 - スレッド選択中（メール本文表示）", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);
  // 最初のスレッドをクリック
  const firstThread = page.locator("text=プロジェクト進捗レビュー").first();
  if (await firstThread.isVisible()) {
    await firstThread.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-thread-selected.png`, fullPage: false });
});

test("03 - カテゴリフィルタ（重要、フラットビュー）", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);
  // サイドバーの「重要」カテゴリをクリック
  const categoryBtn = page.locator("text=重要").first();
  if (await categoryBtn.isVisible()) {
    await categoryBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-category-filter.png`, fullPage: false });
});

test("04 - 設定画面", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);
  // サイドバーの設定ボタンをクリック
  const settingsBtn = page.getByRole("button", { name: /設定/ });
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-settings.png`, fullPage: false });
});

test("05 - コマンドパレット", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);
  // body にフォーカスを当ててから Ctrl+K を送信
  await page.locator("body").click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  // コマンドパレットが開いたか確認（「コマンドを検索」プレースホルダで判定）
  const searchInput = page.getByPlaceholder("コマンドを検索...");
  if (!(await searchInput.isVisible().catch(() => false))) {
    // fallback: KeyboardEvent を window に直接 dispatch
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-command-palette.png`, fullPage: false });
});

test("06 - オンボーディング（アカウント未登録）", async ({ page }) => {
  // API モックは不要（アカウント0件なので API コールが発生しない）
  await page.goto("/?empty=1");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-onboarding.png`, fullPage: false });
});
