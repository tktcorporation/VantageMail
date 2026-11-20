/**
 * Vitest Browser Mode 設定ファイル。
 *
 * 背景: IntersectionObserver など jsdom では再現できないブラウザAPIの
 * 動作を検証するために、Playwright + Chromium で実ブラウザ上でテストする。
 * *.browser.test.tsx ファイルのみを対象とし、既存の jsdom テストとは分離する。
 *
 * headless モードが効かない環境では xvfb-run 経由で実行すること:
 *   xvfb-run pnpm --filter @vantagemail/ui run test:browser -- --run
 */
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
      locators: {
        // Vitest v4 compatibility: keep partial, case-insensitive locator matching.
        // Remove after updating locators for full, case-sensitive matches.
        // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
        // https://vitest.dev/guide/migration/#locators-are-strict-by-default
        exact: false,
      },
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: ["--no-sandbox"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
