/**
 * Effect-TS ベースのエラー型定義。
 *
 * 背景: Gmail OAuth認証、暗号化、DB操作、API通信で発生するエラーを
 * TaggedErrorとして型安全に表現する。Effect の型レベルエラーチャネルで
 * 呼び出し側がハンドリング漏れを防げる。
 *
 * 各エラーには _tag フィールドが自動付与され、パターンマッチで分岐可能。
 */
import { Data } from "effect"

// ─── Auth / OAuth ───

/** Google OAuth トークン交換失敗（code → token） */
export class TokenExchangeError extends Data.TaggedError("TokenExchangeError")<{
  readonly status: number
  readonly details: string
}> {}

/** refresh_token が存在しない（初回認証でoffline accessを取得できなかった場合等） */
export class RefreshTokenMissing extends Data.TaggedError("RefreshTokenMissing")<{}> {}

/** id_token から google_sub（不変ユーザーID）を取り出せなかった */
export class GoogleSubExtractionError extends Data.TaggedError("GoogleSubExtractionError")<{
  readonly reason: string
}> {}

/** セッション関連のエラー（期限切れ、改ざん検知等） */
export class SessionError extends Data.TaggedError("SessionError")<{
  readonly reason: string
}> {}

/** 認証されていない状態でのアクセス */
export class NotAuthenticated extends Data.TaggedError("NotAuthenticated")<{}> {}

// ─── Crypto ───

/** トークン復号失敗（鍵不一致、データ破損等） */
export class DecryptionError extends Data.TaggedError("DecryptionError")<{
  readonly reason: string
}> {}

/** トークン暗号化失敗 */
export class EncryptionError extends Data.TaggedError("EncryptionError")<{
  readonly reason: string
}> {}

/** 暗号鍵の導出失敗（HKDF等） */
export class KeyDerivationError extends Data.TaggedError("KeyDerivationError")<{
  readonly reason: string
}> {}

// ─── Database ───

/** D1/SQLite クエリ実行エラー */
export class DbQueryError extends Data.TaggedError("DbQueryError")<{
  readonly query: string
  readonly reason: string
}> {}

/** レコードが見つからない */
export class DbNotFoundError extends Data.TaggedError("DbNotFoundError")<{
  readonly table: string
  readonly key: string
}> {}

// ─── Gmail API ───

/** Gmail REST API のエラーレスポンス */
export class GmailApiError extends Data.TaggedError("GmailApiError")<{
  readonly status: number
  readonly path: string
  readonly body: string
}> {}

// ─── Config ───

/** 必須の環境変数・設定値が未設定 */
export class ConfigMissingError extends Data.TaggedError("ConfigMissingError")<{
  readonly key: string
}> {}

// ─── Aggregate Types ───

/**
 * 認証フロー全体で発生しうるエラーの union 型。
 * Effect の error channel に指定して網羅的ハンドリングを強制する。
 */
export type AuthError =
  | TokenExchangeError
  | RefreshTokenMissing
  | GoogleSubExtractionError
  | SessionError
  | NotAuthenticated
  | DecryptionError
  | KeyDerivationError
  | DbQueryError
  | DbNotFoundError
