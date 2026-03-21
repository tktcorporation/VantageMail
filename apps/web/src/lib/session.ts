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
  accessTokenCache?: Record<
    string,
    { accessToken: string; expiresAt: number }
  >;
}

/**
 * セッションの暗号化パスワード。
 *
 * GOOGLE_CLIENT_SECRET と同じく、サーバーサイドのシークレットとして管理する。
 * 未設定時はフォールバック値を使うが、本番では必ず SESSION_SECRET を設定すること。
 */
function getSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    // 開発環境用フォールバック。本番では SESSION_SECRET を wrangler secret で設定する
    return "vantagemail-dev-session-secret-min-32-chars!!";
  }
  return secret;
}

/** セッション設定（全サーバールートで共有） */
export function getSessionConfig(): SessionConfig {
  return {
    password: getSessionPassword(),
    name: "vantagemail-session",
    maxAge: 60 * 60 * 24 * 30, // 30日
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

/**
 * SERVER_SECRET を取得する。
 * HKDF で KEK を導出するために使う。SESSION_SECRET とは別のシークレット。
 *
 * 背景: SESSION_SECRET はセッション Cookie の暗号化に使い、
 * SERVER_SECRET は D1 内のトークン暗号化キー（KEK）の導出に使う。
 * 分離することで、一方が漏洩しても他方のセキュリティに影響しない。
 */
export function getServerSecret(): string {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SERVER_SECRET must be set in production");
    }
    // 開発環境用フォールバック
    return "vantagemail-dev-server-secret-min-32-chars!!";
  }
  return secret;
}
