/**
 * マルチアカウント管理の型定義。
 *
 * 背景: VantageMailのコア機能は3つ以上のGmailアカウントの統合管理。
 * 各アカウントは独立したOAuthトークンとGmail API接続を持ち、
 * Unified Inboxで横断表示される（spec §5.1）。
 */

/** OAuth 2.0トークンペア */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** トークン有効期限（Unix timestamp ミリ秒） */
  expiresAt: number;
  /** 要求したスコープ */
  scope: string;
}

/**
 * 接続済みGmailアカウント。
 *
 * ライフサイクル: OAuth認証完了時に作成され、ユーザーがアカウントを削除するまで永続。
 * トークンはデスクトップではOSキーチェーン、WebではEncrypted IndexedDBに保存。
 */
export interface Account {
  /** 一意識別子（UUID v4） */
  id: string;
  /** Gmailアドレス */
  email: string;
  /** Googleプロフィール名 */
  displayName: string;
  /** Googleプロフィール画像URL */
  avatarUrl?: string;
  /** アカウント識別用カラー（サイドバーのカラードット表示用） */
  color: string;
  /** 未読メール数 */
  unreadCount: number;
  /** アカウントごとの署名 */
  signature?: string;
  /** 通知を受け取るか */
  notificationsEnabled: boolean;
}

/**
 * アカウントの接続状態。
 * UIでの表示とエラーハンドリングに使用。
 */
export type AccountConnectionStatus =
  | "connected"
  | "refreshing"
  | "token_expired"
  | "error";

/**
 * アプリ内で表示するメールスレッドの正規化された形。
 *
 * 背景: Gmail APIのGmailThreadをUI表示用に正規化したもの。
 * 複数アカウントをまたいでUnified Inboxに表示するため、
 * accountIdフィールドでどのアカウントのスレッドかを識別する。
 */
export interface Thread {
  id: string;
  /** このスレッドが属するアカウントのID */
  accountId: string;
  subject: string;
  snippet: string;
  /** スレッドの最新メッセージの日時 */
  lastMessageAt: Date;
  /** 参加者のメールアドレス一覧 */
  participants: string[];
  /** スレッド内のメッセージ数 */
  messageCount: number;
  /** 適用されているラベルID */
  labelIds: string[];
  /** 未読かどうか */
  isUnread: boolean;
  /** スター付きかどうか */
  isStarred: boolean;
  /** スヌーズ中の場合、再表示時刻 */
  snoozedUntil?: Date;
  /** ピン留めされているか */
  isPinned: boolean;
}

/**
 * UI表示用の正規化されたメッセージ。
 */
export interface Message {
  id: string;
  threadId: string;
  accountId: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  cc: Array<{ name: string; email: string }>;
  subject: string;
  /** プレーンテキストのスニペット */
  snippet: string;
  /** HTMLボディ */
  bodyHtml: string;
  /** プレーンテキストボディ */
  bodyText: string;
  date: Date;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  attachments: Attachment[];
}

/** 添付ファイルのメタデータ */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}
