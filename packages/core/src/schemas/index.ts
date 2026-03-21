/**
 * Schema 定義の集約エクスポート。
 *
 * 背景: 各ドメインの Schema と、そこから導出された型を一箇所からインポート可能にする。
 * 利用側は `import { AccountSchema, type Account } from "@vantagemail/core"` で使える。
 */

// Account / OAuthTokens
export {
  AccountSchema,
  OAuthTokensSchema,
  AccountConnectionStatusSchema,
} from "./account.js"
export type { Account, OAuthTokens, AccountConnectionStatus } from "./account.js"

// Thread
export { ThreadSchema } from "./thread.js"
export type { Thread } from "./thread.js"

// Message / Attachment
export { MessageSchema, AttachmentSchema, EmailContactSchema } from "./message.js"
export type { Message, Attachment } from "./message.js"

// Gmail API
export {
  GmailHeaderSchema,
  GmailMessagePartSchema,
  GmailMessageSchema,
  GmailThreadSchema,
  GmailLabelSchema,
  GmailSearchResultSchema,
  GmailCategorySchema,
  OAuthTokenResponseSchema,
  GoogleUserInfoSchema,
} from "./gmail-api.js"
export type {
  GmailHeader,
  GmailMessagePart,
  GmailMessage,
  GmailThread,
  GmailLabel,
  GmailSearchResult,
  GmailCategory,
  OAuthTokenResponse,
  GoogleUserInfo,
} from "./gmail-api.js"
