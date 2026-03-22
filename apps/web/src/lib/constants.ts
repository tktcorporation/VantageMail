/**
 * ビルド時にインライン化される定数。
 *
 * 背景: VITE_ プレフィックスの環境変数は import.meta.env 経由でビルド時に値が埋め込まれる。
 * Cloudflare Workers の実行時には process.env / env bindings には存在しない。
 * このファイルが全 VITE_* 変数のシングルソースオブトゥルース。
 *
 * 参照: apps/web/src/env.d.ts（型定義）
 */

/** Google OAuth 2.0 クライアントID。Google Cloud Console で発行される */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

/**
 * OAuth リダイレクト URI のオーバーライド。
 * 未設定の場合はリクエストの origin から自動生成する（`${origin}/oauth/callback`）。
 * ローカル開発で Workers のポートとアプリのポートが異なる場合に設定する。
 */
export const OAUTH_REDIRECT_URI_OVERRIDE = import.meta.env.VITE_OAUTH_REDIRECT_URI as
  | string
  | undefined;
