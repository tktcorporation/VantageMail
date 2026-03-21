/**
 * Thread の Schema 定義。
 *
 * 背景: Gmail APIのGmailThreadをUI表示用に正規化した形。
 * 複数アカウントをまたいでUnified Inboxに表示するため、
 * accountIdフィールドでどのアカウントのスレッドかを識別する。
 */
import { Schema } from "@effect/schema"

/** アプリ内で表示するメールスレッドの正規化された形 */
export const ThreadSchema = Schema.Struct({
  id: Schema.String,
  /** このスレッドが属するアカウントのID */
  accountId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  /** スレッドの最新メッセージの日時 */
  lastMessageAt: Schema.DateFromSelf,
  /** 参加者のメールアドレス一覧 */
  participants: Schema.Array(Schema.String),
  /** スレッド内のメッセージ数 */
  messageCount: Schema.Number,
  /** 適用されているラベルID */
  labelIds: Schema.Array(Schema.String),
  /** 未読かどうか */
  isUnread: Schema.Boolean,
  /** スター付きかどうか */
  isStarred: Schema.Boolean,
  /** スヌーズ中の場合、再表示時刻 */
  snoozedUntil: Schema.optional(Schema.DateFromSelf),
  /** ピン留めされているか */
  isPinned: Schema.Boolean,
})

export type Thread = typeof ThreadSchema.Type
