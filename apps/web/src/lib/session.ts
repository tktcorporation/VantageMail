/**
 * セッション設定と型定義。
 *
 * 背景: マルチアカウント認証では、セッションにユーザーIDとDEK（データ暗号化キー）を保持する。
 * トークン自体は D1 に暗号化保存されており、セッションには含まない。
 * access_token のキャッシュのみセッションに持つ（短命なので永続化不要）。
 *
 * 旧方式（StoredAccount[] をセッションに直接格納）からの破壊的移行。
 */
import type { SessionConfig } from "@tanstack/react-start/server";

/**
 * セッションデータの型。
 *
 * ログイン済みの場合 userId と dek が存在する。
 * dek は平文（base64）でセッションに保持し、リクエストごとに D1 から復号するコストを避ける。
 * セッション自体が暗号化 Cookie なので、dek がクライアントに露出することはない。
 */
export interface AppSessionData {
  /** users.id（ログイン済みの場合に存在） */
  userId?: string;
  /** DEK の平文（base64）。D1 の暗号化トークンを復号するために使う */
  dek?: string;
  /** OAuth フロー中の PKCE code_verifier。認証完了後に削除される */
  codeVerifier?: string;
  /**
   * access_token のリクエスト間キャッシュ。
   * accountId → { accessToken, expiresAt } のマップ。
   * セッション切れ時に消えるが、refresh_token から再取得可能なので問題ない。
   */
  accessTokenCache?: Record<string, { accessToken: string; expiresAt: number }>;
}

/**
 * セッション設定を構築する。
 *
 * 背景: SESSION_SECRET は ConfigService 経由で注入される。
 * process.env を直接参照せず、呼び出し元から password を受け取ることで
 * 環境変数アクセスの Single Source of Truth を ConfigService に統一する。
 *
 * secure は常に true とする。wrangler.jsonc の vars に NODE_ENV を定義していないため
 * process.env.NODE_ENV は Cloudflare Workers ランタイム上で "production" にならず、
 * これを判定に使うと本番でも secure Cookie にならない（以前のバグ）。
 * Cloudflare Workers は workers.dev / カスタムドメインとも常に HTTPS 終端されるため、
 * secure: true 固定で問題ない（wrangler dev のローカル開発も localhost は
 * ブラウザから secure context として扱われるため動作する）。
 */
export function getSessionConfig(password: string): SessionConfig {
  return {
    password,
    name: "vantagemail-session",
    maxAge: 60 * 60 * 24 * 30, // 30日
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

// getServerSecret() は削除済み。
// SERVER_SECRET は ConfigService 経由で取得する（apps/web/src/lib/services/ConfigService.ts）。
