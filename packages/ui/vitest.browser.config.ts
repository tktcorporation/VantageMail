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
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
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
