/**
 * Gmail APIのレスポンスに対応する型定義。
 *
 * 背景: Gmail REST API v1 のデータモデルをTypeScriptの型として表現する。
 * IMAPではなくGmail APIを使うことで、ラベル・カテゴリ・スレッドを
 * ネイティブにサポートする（spec §7.1 参照）。
 */

/** Gmail APIから返されるメッセージヘッダー */
export interface GmailHeader {
  name: string;
  value: string;
}

/** Gmail APIのメッセージパート（MIME構造） */
export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: {
    attachmentId?: string;
    size: number;
    /** Base64urlエンコードされたボディデータ */
    data?: string;
  };
  parts?: GmailMessagePart[];
}

/**
 * Gmail APIのメッセージリソース。
 * 参照: https://developers.google.com/gmail/api/reference/rest/v1/users.messages
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  /** メッセージのスニペット（プレーンテキスト、HTMLタグなし） */
  snippet: string;
  /** RFC 2822形式のメッセージペイロード */
  payload: GmailMessagePart;
  /** メッセージサイズ（バイト） */
  sizeEstimate: number;
  historyId: string;
  /** 内部タイムスタンプ（ミリ秒） */
  internalDate: string;
}

/**
 * Gmail APIのスレッドリソース。
 *
 * 背景: Gmail APIはスレッドファーストなデータモデルを持つ。
 * IMAPと異なり、スレッドをクライアント側で構築する必要がない。
 */
export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

/**
 * Gmailラベル。システムラベル（INBOX, SENT等）とユーザーラベルの両方を表現。
 */
export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  /** ラベルリスト内での表示/非表示 */
  labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  /** メッセージリスト内での表示/非表示 */
  messageListVisibility?: "show" | "hide";
  color?: {
    textColor: string;
    backgroundColor: string;
  };
  /** 未読メッセージ数 */
  messagesUnread?: number;
  /** 合計メッセージ数 */
  messagesTotal?: number;
}

/** Gmail検索結果のレスポンス */
export interface GmailSearchResult {
  messages: Array<{ id: string; threadId: string }>;
  resultSizeEstimate: number;
  nextPageToken?: string;
}

/**
 * Gmailカテゴリ。Smart Inboxグルーピングに使用。
 *
 * 背景: GmailはメールをPrimary/Social/Promotions/Updates/Forumsに
 * 自動分類する。この分類をSmart Inboxの「人物/更新/ニュースレター」
 * グルーピングのベースにする（spec §5.2）。
 */
export type GmailCategory =
  | "CATEGORY_PERSONAL"
  | "CATEGORY_SOCIAL"
  | "CATEGORY_PROMOTIONS"
  | "CATEGORY_UPDATES"
  | "CATEGORY_FORUMS";
