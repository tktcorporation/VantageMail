/**
 * @vantagemail/core — 共有ビジネスロジック
 *
 * Gmail APIクライアント、状態管理、型定義をデスクトップ/Web両方に提供する。
 * プラットフォーム固有のコードは含まない。
 */
import { Effect } from "effect"
import type { OAuthConfig } from "./gmail/oauth.js"
import {
  createAuthorizationUrl as createAuthorizationUrlEffect,
  exchangeCodeForTokens as exchangeCodeForTokensEffect,
  refreshAccessToken as refreshAccessTokenEffect,
  fetchUserInfo as fetchUserInfoEffect,
} from "./gmail/oauth.js"

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

// Gmail API — Effect 版サービス + ファクトリ
export {
  GmailClient,
  makeGmailClient,
  GmailApiErrorLegacy,
  listThreads,
  getThread,
  modifyThread,
  trashThread,
  getMessage,
  sendMessage,
  listLabels,
  createLabel,
  searchMessages,
  listHistory,
} from "./gmail/client.js"
export type { GmailClientService } from "./gmail/client.js"

// Gmail API — OAuth（Effect 版、Effect サフィックス付き）
export {
  createAuthorizationUrl as createAuthorizationUrlEffect,
  exchangeCodeForTokens as exchangeCodeForTokensEffect,
  refreshAccessToken as refreshAccessTokenEffect,
  fetchUserInfo as fetchUserInfoEffect,
  type OAuthConfig,
} from "./gmail/oauth.js"

// Gmail API — OAuth（Promise 版、後方互換ラッパー）
// 背景: 既存の呼び出し元（use-oauth.ts, api/auth/start.ts）は await で使用しているため、
// Effect.runPromise でラップした Promise 版を同名でエクスポートする。
// Task 5/6 で呼び出し元が Effect 化されたら、これらは削除可能。

/**
 * Google OAuth認可URLを生成する（Promise 版、後方互換）。
 * Effect 版を使う場合は createAuthorizationUrlEffect を使用。
 */
export async function createAuthorizationUrl(
  config: OAuthConfig,
): Promise<{ url: string; codeVerifier: string }> {
  return Effect.runPromise(createAuthorizationUrlEffect(config))
}

/**
 * 認可コードをOAuthトークンに交換する（Promise 版、後方互換）。
 * Effect 版を使う場合は exchangeCodeForTokensEffect を使用。
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<{
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly scope: string
}> {
  return Effect.runPromise(
    exchangeCodeForTokensEffect(config, code, codeVerifier),
  )
}

/**
 * リフレッシュトークンを使ってアクセストークンを更新する（Promise 版、後方互換）。
 * Effect 版を使う場合は refreshAccessTokenEffect を使用。
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<{
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly scope: string
}> {
  return Effect.runPromise(
    refreshAccessTokenEffect(config, refreshToken),
  )
}

/**
 * Googleユーザー情報を取得する（Promise 版、後方互換）。
 * Effect 版を使う場合は fetchUserInfoEffect を使用。
 */
export async function fetchUserInfo(
  accessToken: string,
): Promise<{
  readonly id: string
  readonly email: string
  readonly name: string
  readonly verified_email?: boolean
  readonly picture?: string
}> {
  return Effect.runPromise(fetchUserInfoEffect(accessToken))
}

// Gmail API — アダプター（純粋関数、変更なし）
export { adaptGmailThread, adaptGmailMessage } from "./gmail/adapter.js"

// Gmail API — 同期（Effect 版）
export { syncAccountThreads, incrementalSync } from "./gmail/sync.js"
