/**
 * @vantagemail/core — 共有ビジネスロジック
 *
 * Gmail APIクライアント、状態管理、型定義をデスクトップ/Web両方に提供する。
 * プラットフォーム固有のコードは含まない。
 */

// Schema 定義 + 型（schemas/ が正規の定義元）
export * from "./schemas/index.js"

// エラー型
export * from "./errors.js"

// 型定義（後方互換：schemas/ からの re-export）
export * from "./types/gmail.js"
export * from "./types/account.js"

// 状態管理ストア
export * from "./stores/accounts.js"
export * from "./stores/threads.js"

// Gmail API
export { GmailClient, GmailApiError as GmailApiErrorLegacy } from "./gmail/client.js"
export {
  createAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  type OAuthConfig,
  type GoogleUserInfo,
} from "./gmail/oauth.js"
export { adaptGmailThread, adaptGmailMessage } from "./gmail/adapter.js"
export { syncAccountThreads, incrementalSync } from "./gmail/sync.js"
