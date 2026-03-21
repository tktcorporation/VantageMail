/**
 * Gmail APIのレスポンスに対応する型定義。
 *
 * 背景: Gmail REST API v1 のデータモデルをTypeScriptの型として表現する。
 * IMAPではなくGmail APIを使うことで、ラベル・カテゴリ・スレッドを
 * ネイティブにサポートする（spec §7.1 参照）。
 *
 * 型は schemas/gmail-api.ts の Schema 定義から導出される。
 * このファイルは後方互換のための re-export ハブ。
 */
export type {
  GmailHeader,
  GmailMessagePart,
  GmailMessage,
  GmailThread,
  GmailLabel,
  GmailSearchResult,
  GmailCategory,
} from "../schemas/index.js"
