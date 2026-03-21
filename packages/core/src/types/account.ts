/**
 * マルチアカウント管理の型定義。
 *
 * 背景: VantageMailのコア機能は3つ以上のGmailアカウントの統合管理。
 * 各アカウントは独立したOAuthトークンとGmail API接続を持ち、
 * Unified Inboxで横断表示される（spec §5.1）。
 *
 * 型は schemas/ の Schema 定義から導出される。
 * このファイルは後方互換のための re-export ハブ。
 */
export type {
  Account,
  OAuthTokens,
  AccountConnectionStatus,
  Thread,
  Message,
  Attachment,
} from "../schemas/index.js"
