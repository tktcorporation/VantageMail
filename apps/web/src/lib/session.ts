/**
 * セッション設定と型定義。
 *
 * 背景: TanStack Start の暗号化セッション（iron-session 方式）を使い、
 * アカウント情報とOAuthトークンをサーバーサイドで管理する。
 * Cookie は httpOnly + Secure + AES 暗号化されるため、
 * クライアントJSからトークンを読み取れない。
 *
 * セッションのライフサイクル:
 * - OAuthコールバック成功時にアカウント+トークンを保存
 * - ページロード時にloaderがセッションを読みアカウント情報をクライアントに渡す
 * - トークンはサーバー側でのみ使用（クライアントには渡さない）
 */
import type { SessionConfig } from "@tanstack/react-start/server";
import type { Account, OAuthTokens } from "@vantagemail/core";

/**
 * クライアントに渡すアカウント情報（トークンを含まない安全な部分集合）。
 * サイドバー表示やアカウント切替に使う。
 */
export type ClientAccount = Account;

/**
 * セッション内部に保存するアカウント情報（トークン含む）。
 * サーバー側でのみ参照する。暗号化Cookieに格納されるためクライアントに露出しない。
 */
export interface StoredAccount {
  account: Account;
  tokens: OAuthTokens;
}

/**
 * セッションデータの型。
 * 暗号化Cookieに格納される全データを表す。
 */
export interface AppSessionData {
  accounts: StoredAccount[];
  /** OAuth フロー中の PKCE code_verifier。認証完了後に削除される */
  codeVerifier?: string;
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
