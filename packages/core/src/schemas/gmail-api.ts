/**
 * Gmail REST API v1 のレスポンスに対応する Schema 定義。
 *
 * 背景: Gmail REST API v1 のデータモデルを Schema として表現し、
 * APIレスポンスの実行時バリデーションを行う。
 * types/gmail.ts の既存インターフェースと完全一致する形状を維持する。
 */
import { Schema } from "@effect/schema"

/** Gmail APIから返されるメッセージヘッダー */
export const GmailHeaderSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
})

export type GmailHeader = typeof GmailHeaderSchema.Type

/** Gmail APIのメッセージパート（MIME構造） — 再帰型 */
export interface GmailMessagePart {
  readonly partId: string
  readonly mimeType: string
  readonly filename: string
  readonly headers: ReadonlyArray<GmailHeader>
  readonly body: {
    readonly attachmentId?: string
    readonly size: number
    readonly data?: string
  }
  readonly parts?: ReadonlyArray<GmailMessagePart>
}

/**
 * GmailMessagePartSchema は再帰構造のため Schema.suspend で定義。
 * Gmail APIのMIMEパートツリーを表現する。
 */
export const GmailMessagePartSchema: Schema.Schema<GmailMessagePart> = Schema.suspend(
  () =>
    Schema.Struct({
      partId: Schema.String,
      mimeType: Schema.String,
      filename: Schema.String,
      headers: Schema.Array(GmailHeaderSchema),
      body: Schema.Struct({
        attachmentId: Schema.optional(Schema.String),
        size: Schema.Number,
        /** Base64urlエンコードされたボディデータ */
        data: Schema.optional(Schema.String),
      }),
      parts: Schema.optional(Schema.Array(Schema.suspend(() => GmailMessagePartSchema))),
    }),
)

/**
 * Gmail APIのメッセージリソース。
 * 参照: https://developers.google.com/gmail/api/reference/rest/v1/users.messages
 */
export const GmailMessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  labelIds: Schema.Array(Schema.String),
  /** メッセージのスニペット（プレーンテキスト、HTMLタグなし） */
  snippet: Schema.String,
  /** RFC 2822形式のメッセージペイロード */
  payload: GmailMessagePartSchema,
  /** メッセージサイズ（バイト） */
  sizeEstimate: Schema.Number,
  historyId: Schema.String,
  /** 内部タイムスタンプ（ミリ秒） */
  internalDate: Schema.String,
})

export type GmailMessage = typeof GmailMessageSchema.Type

/**
 * Gmail APIのスレッドリソース。
 * Gmail APIはスレッドファーストなデータモデルを持ち、
 * IMAPと異なりスレッドをクライアント側で構築する必要がない。
 */
export const GmailThreadSchema = Schema.Struct({
  id: Schema.String,
  historyId: Schema.String,
  messages: Schema.Array(GmailMessageSchema),
})

export type GmailThread = typeof GmailThreadSchema.Type

/** Gmailラベル。システムラベル（INBOX, SENT等）とユーザーラベルの両方を表現。 */
export const GmailLabelSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.Literal("system", "user"),
  /** ラベルリスト内での表示/非表示 */
  labelListVisibility: Schema.optional(
    Schema.Literal("labelShow", "labelShowIfUnread", "labelHide"),
  ),
  /** メッセージリスト内での表示/非表示 */
  messageListVisibility: Schema.optional(Schema.Literal("show", "hide")),
  color: Schema.optional(
    Schema.Struct({
      textColor: Schema.String,
      backgroundColor: Schema.String,
    }),
  ),
  /** 未読メッセージ数 */
  messagesUnread: Schema.optional(Schema.Number),
  /** 合計メッセージ数 */
  messagesTotal: Schema.optional(Schema.Number),
})

export type GmailLabel = typeof GmailLabelSchema.Type

/** Gmail検索結果のレスポンス */
export const GmailSearchResultSchema = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      threadId: Schema.String,
    }),
  ),
  resultSizeEstimate: Schema.Number,
  nextPageToken: Schema.optional(Schema.String),
})

export type GmailSearchResult = typeof GmailSearchResultSchema.Type

/**
 * Gmailカテゴリ。Smart Inboxグルーピングに使用。
 * GmailはメールをPrimary/Social/Promotions/Updates/Forumsに自動分類する。
 */
export const GmailCategorySchema = Schema.Literal(
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
)

export type GmailCategory = typeof GmailCategorySchema.Type

// ─── OAuth / UserInfo レスポンス ───

/**
 * Google OAuth トークンエンドポイントのレスポンス（snake_case）。
 * code → token 交換、および refresh token によるトークン更新で使用。
 */
export const OAuthTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  scope: Schema.String,
  token_type: Schema.String,
  id_token: Schema.optional(Schema.String),
})

export type OAuthTokenResponse = typeof OAuthTokenResponseSchema.Type

/**
 * Google UserInfo エンドポイントのレスポンス。
 * アカウント追加時にユーザーのプロフィール情報を取得するために使用。
 */
export const GoogleUserInfoSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  verified_email: Schema.optional(Schema.Boolean),
  name: Schema.String,
  picture: Schema.optional(Schema.String),
})

export type GoogleUserInfo = typeof GoogleUserInfoSchema.Type
