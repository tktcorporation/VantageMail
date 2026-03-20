/**
 * Vite 環境変数の型安全なアクセサ。
 *
 * 背景: Vite は VITE_ プレフィクスの環境変数をクライアントに公開する。
 * このモジュールで型チェックと必須チェックを一箇所にまとめ、
 * 設定漏れを起動時に検出する。
 *
 * 値の設定先: apps/web/.env.local（開発用）, .env.production（本番用）
 * 取得元: infrastructure/SETUP_VALUES.md を参照
 */

import type { OAuthConfig } from "@vantagemail/core";

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `環境変数 ${key} が設定されていません。apps/web/.env.local を確認してください。` +
      `\n詳細: infrastructure/SETUP_VALUES.md`,
    );
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return import.meta.env[key] || fallback;
}

/**
 * OAuth 設定を環境変数から構築する。
 * packages/core の OAuthConfig インターフェースに合わせた形で返す。
 */
export function getOAuthConfig(): OAuthConfig {
  return {
    clientId: requireEnv("VITE_GOOGLE_CLIENT_ID"),
    redirectUri: optionalEnv(
      "VITE_OAUTH_REDIRECT_URI",
      `${window.location.origin}/oauth/callback`,
    ),
    tokenProxyUrl: optionalEnv("VITE_OAUTH_PROXY_URL", ""),
  };
}

/** Gmail Pub/Sub トピック名（watch() API に渡す） */
export function getPubSubTopic(): string {
  return requireEnv("VITE_PUBSUB_TOPIC");
}
