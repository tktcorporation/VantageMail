/**
 * Account / OAuthTokens の Schema 定義。
 *
 * 背景: Gmail APIレスポンスやDB行をデコードする際に、
 * 実行時バリデーションと型推論を同時に行う。
 * types/account.ts の既存インターフェースと完全一致する形状を維持する。
 */
import { Schema } from "@effect/schema";

/** OAuth 2.0トークンペア */
export const OAuthTokensSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  /** トークン有効期限（Unix timestamp ミリ秒） */
  expiresAt: Schema.Number,
  /** 要求したスコープ */
  scope: Schema.String,
});

export type OAuthTokens = typeof OAuthTokensSchema.Type;

/** 接続済みGmailアカウント */
export const AccountSchema = Schema.Struct({
  /** 一意識別子（UUID v4） */
  id: Schema.String,
  /** Gmailアドレス */
  email: Schema.String,
  /** Googleプロフィール名 */
  displayName: Schema.String,
  /** Googleプロフィール画像URL */
  avatarUrl: Schema.optional(Schema.String),
  /** アカウント識別用カラー（サイドバーのカラードット表示用） */
  color: Schema.String,
  /** 未読メール数 */
  unreadCount: Schema.Number,
  /** アカウントごとの署名 */
  signature: Schema.optional(Schema.String),
  /** 通知を受け取るか */
  notificationsEnabled: Schema.Boolean,
});

export type Account = typeof AccountSchema.Type;

/**
 * アカウントの接続状態。
 * UIでの表示とエラーハンドリングに使用。
 */
export type AccountConnectionStatus = "connected" | "refreshing" | "token_expired" | "error";

export const AccountConnectionStatusSchema = Schema.Literal(
  "connected",
  "refreshing",
  "token_expired",
  "error",
);
