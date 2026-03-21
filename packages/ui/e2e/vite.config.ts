/**
 * スクリーンショット撮影専用の Vite 設定。
 *
 * 背景: packages/ui のコンポーネントを直接レンダリングするための
 * 軽量 Vite dev server。apps/web の TanStack Start 環境に依存しない。
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [tailwindcss(), react()],
  server: {
    port: 5199,
    strictPort: true,
  },
});
