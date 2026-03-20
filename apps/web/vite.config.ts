import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Web版のVite設定。
 *
 * 背景: Cloudflare Pagesにデプロイ可能な静的ビルドを出力する。
 * packages/core と packages/ui をソースから直接参照し、
 * Viteのトランスパイルで処理する（ビルド済みdistは不要）。
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2024",
    outDir: "dist",
  },
  server: {
    port: 5173,
  },
});
