/**
 * @vantagemail/core — 共有ビジネスロジック
 *
 * Gmail APIクライアント、状態管理、型定義をデスクトップ/Web両方に提供する。
 * プラットフォーム固有のコードは含まない。
 */

// 型定義
export * from "./types/gmail";
export * from "./types/account";

// 状態管理ストア
export * from "./stores/accounts";
export * from "./stores/threads";

// Gmail API
export { GmailClient, GmailApiError } from "./gmail/client";
export {
  createAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  type OAuthConfig,
  type GoogleUserInfo,
} from "./gmail/oauth";
export { adaptGmailThread, adaptGmailMessage } from "./gmail/adapter";
export { syncAccountThreads, incrementalSync } from "./gmail/sync";
