/**
 * Knip 設定 — 未使用ファイル・export・依存関係の検知。
 *
 * 背景: コードベースの健全性を維持するため、使われていないコード・依存関係を
 * 自動検知する。CI でも実行し、不要コードの蓄積を防ぐ。
 */
import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // vite.config.ts は vite-plus (vp) CLI の設定ファイルとして使用
  ignore: ["vite.config.ts"],
  workspaces: {
    "apps/web": {
      // TanStack Start: router.tsx + ファイルベースルートが entry
      entry: ["src/router.tsx", "src/routes/**/*.{ts,tsx}", "src/lib/**/*.ts"],
      project: ["src/**/*.{ts,tsx}"],
      ignoreDependencies: [
        // vite plugin として使用（wrangler.jsonc 経由）
        "@tanstack/router-plugin",
        // CSS で @import "tailwindcss" として使用、JS import ではない
        "tailwindcss",
      ],
    },
    "packages/core": {
      // デフォルト entry (src/index.ts) で OK
    },
    "packages/ui": {
      // Playwright スクリーンショットスクリプトのエントリーポイントも含む
      entry: ["e2e/**/*.{ts,tsx}"],
      project: ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
      ignoreDependencies: [
        // Tailwind は PostCSS プラグインとして使用、直接 import されない
        "tailwindcss",
        // dompurify の型定義、thread-view.tsx で使用
        "@types/dompurify",
      ],
    },
    workers: {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
      ignoreDependencies: [
        // wrangler は CLI として使用
        "wrangler",
      ],
    },
  },
  ignoreDependencies: [
    // OxLint は CLI として使用、jsPlugins で ESLint プラグインを読み込む
    "oxlint",
    "@effect/eslint-plugin",
  ],
  ignoreBinaries: [
    // workers/package.json の scripts で使用
    "wrangler",
    "tsc",
  ],
};

export default config;
