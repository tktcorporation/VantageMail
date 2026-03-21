/**
 * Message / Attachment の Schema 定義。
 *
 * 背景: Gmail APIレスポンスをUI表示用に正規化したメッセージ形状。
 * from/to/cc は { name, email } の構造化データとして保持する。
 */
import { Schema } from "@effect/schema"

/** メールアドレスと表示名のペア */
export const EmailContactSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
})

/** 添付ファイルのメタデータ */
export const AttachmentSchema = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
})

export type Attachment = typeof AttachmentSchema.Type

/** UI表示用の正規化されたメッセージ */
export const MessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  accountId: Schema.String,
  from: EmailContactSchema,
  to: Schema.Array(EmailContactSchema),
  cc: Schema.Array(EmailContactSchema),
  subject: Schema.String,
  /** プレーンテキストのスニペット */
  snippet: Schema.String,
  /** HTMLボディ */
  bodyHtml: Schema.String,
  /** プレーンテキストボディ */
  bodyText: Schema.String,
  date: Schema.DateFromSelf,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  attachments: Schema.Array(AttachmentSchema),
})

export type Message = typeof MessageSchema.Type
