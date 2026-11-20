/**
 * スクリーンショット撮影専用の Vite 設定。
 *
 * 背景: packages/ui のコンポーネントを直接レンダリングするための
 * 軽量 Vite dev server。apps/web の TanStack Start 環境に依存しない。
 */
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  root: resolve(import.meta.dirname),
  plugins: [tailwindcss(), react()],
  server: {
    port: 5199,
    strictPort: true,
  },
});
