/**
 * スクリーンショット撮影用の Playwright 設定。
 *
 * 背景: `pnpm screenshot` で UI の各状態を自動撮影するために使う。
 * e2e/vite.config.ts で軽量 dev server を起動し、
 * page.route() で API をモックしてスクショを撮る。
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "screenshots.spec.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  },
  webServer: {
    command: "pnpm exec vite --config e2e/vite.config.ts",
    port: 5199,
    reuseExistingServer: true,
  },
});
