/**
 * Gmail REST API v1 クライアント。
 *
 * 背景: クライアントからGmail APIに直接アクセスする。バックエンド（CF Workers）は
 * メール本文を一切参照しない設計（spec §6.4）。このクライアントは
 * メッセージ取得、ラベル操作、検索、バッチ処理を担当する。
 *
 * レートリミット: 250クォータユニット/ユーザー/秒。
 * 指数バックオフ付きクライアント側レートリミッターを実装（spec §6.5）。
 */
import type {
  GmailThread,
  GmailMessage,
  GmailLabel,
  GmailSearchResult,
} from "../types/gmail";
import type { OAuthTokens } from "../types/account";
import type { OAuthConfig } from "./oauth";
import { refreshAccessToken } from "./oauth";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Gmail APIクライアント。
 *
 * 1アカウントにつき1インスタンスを生成する。
 * トークンの自動リフレッシュ、レートリミット、リトライを内蔵。
 */
export class GmailClient {
  private tokens: OAuthTokens;
  private oauthConfig: OAuthConfig;
  private onTokensRefreshed?: (tokens: OAuthTokens) => void;

  constructor(options: {
    tokens: OAuthTokens;
    oauthConfig: OAuthConfig;
    /** トークンが更新されたときのコールバック（永続化用） */
    onTokensRefreshed?: (tokens: OAuthTokens) => void;
  }) {
    this.tokens = options.tokens;
    this.oauthConfig = options.oauthConfig;
    this.onTokensRefreshed = options.onTokensRefreshed;
  }

  /**
   * Gmail APIにリクエストを送る。トークンの有効期限切れ時は自動リフレッシュ。
   * 429（レートリミット）時は指数バックオフでリトライ。
   */
  private async request<T>(
    path: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<T> {
    // トークン有効期限の5分前にプロアクティブにリフレッシュ
    if (Date.now() > this.tokens.expiresAt - 5 * 60 * 1000) {
      await this.refreshTokens();
    }

    const response = await fetch(`${GMAIL_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // 401: トークン期限切れ → リフレッシュしてリトライ
    if (response.status === 401 && retryCount < 1) {
      await this.refreshTokens();
      return this.request<T>(path, options, retryCount + 1);
    }

    // 429: レートリミット → 指数バックオフ（最大3回）
    if (response.status === 429 && retryCount < 3) {
      const backoffMs = Math.min(1000 * 2 ** retryCount, 8000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return this.request<T>(path, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new GmailApiError(response.status, error, path);
    }

    return response.json();
  }

  private async refreshTokens(): Promise<void> {
    this.tokens = await refreshAccessToken(
      this.oauthConfig,
      this.tokens.refreshToken,
    );
    this.onTokensRefreshed?.(this.tokens);
  }

  // ─── スレッド操作 ───

  /**
   * スレッド一覧を取得する。
   *
   * @param query - Gmail検索クエリ（例: "is:unread", "from:alice"）
   * @param maxResults - 取得件数（デフォルト50）
   * @param pageToken - ページネーション用トークン
   */
  async listThreads(options?: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
  }): Promise<{
    threads: Array<{ id: string; historyId: string; snippet: string }>;
    nextPageToken?: string;
    resultSizeEstimate: number;
  }> {
    const params = new URLSearchParams();
    if (options?.query) params.set("q", options.query);
    if (options?.maxResults) params.set("maxResults", String(options.maxResults));
    if (options?.pageToken) params.set("pageToken", options.pageToken);
    if (options?.labelIds) {
      for (const id of options.labelIds) params.append("labelIds", id);
    }

    const queryString = params.toString();
    return this.request(`/threads${queryString ? `?${queryString}` : ""}`);
  }

  /** スレッドの詳細を取得する（全メッセージ含む） */
  async getThread(threadId: string, format: "full" | "metadata" | "minimal" = "full"): Promise<GmailThread> {
    return this.request(`/threads/${threadId}?format=${format}`);
  }

  /** スレッドのラベルを変更する（アーカイブ、ゴミ箱等） */
  async modifyThread(
    threadId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ): Promise<GmailThread> {
    return this.request(`/threads/${threadId}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }

  /** スレッドをゴミ箱に移動する */
  async trashThread(threadId: string): Promise<GmailThread> {
    return this.request(`/threads/${threadId}/trash`, { method: "POST" });
  }

  // ─── メッセージ操作 ───

  /** メッセージの詳細を取得する */
  async getMessage(messageId: string, format: "full" | "metadata" | "minimal" = "full"): Promise<GmailMessage> {
    return this.request(`/messages/${messageId}?format=${format}`);
  }

  /** メッセージを送信する */
  async sendMessage(raw: string): Promise<GmailMessage> {
    return this.request("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw }),
    });
  }

  // ─── ラベル操作 ───

  /** 全ラベルを取得する */
  async listLabels(): Promise<{ labels: GmailLabel[] }> {
    return this.request("/labels");
  }

  /** ラベルを作成する */
  async createLabel(name: string, options?: {
    labelListVisibility?: string;
    messageListVisibility?: string;
    color?: { textColor: string; backgroundColor: string };
  }): Promise<GmailLabel> {
    return this.request("/labels", {
      method: "POST",
      body: JSON.stringify({ name, ...options }),
    });
  }

  // ─── 検索 ───

  /**
   * Gmail検索演算子を使ったメッセージ検索。
   *
   * 背景: Gmail APIの検索クエリをそのまま渡す。from:, to:, subject:,
   * has:attachment, label:, after:, before: 等の演算子をフルサポート（spec §5.4）。
   */
  async searchMessages(
    query: string,
    maxResults = 20,
    pageToken?: string,
  ): Promise<GmailSearchResult> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request(`/messages?${params.toString()}`);
  }

  // ─── 同期 ───

  /**
   * history.listによるインクリメンタル同期。
   *
   * 背景: プッシュ通知（Pub/Sub）受信後にhistory.listで差分を取得し、
   * ローカルのスレッドストアを更新する（spec §6.5）。
   * フル同期（messages.list）よりもAPIクォータを節約できる。
   */
  async listHistory(
    startHistoryId: string,
    historyTypes?: Array<"messageAdded" | "messageDeleted" | "labelAdded" | "labelRemoved">,
  ): Promise<{
    history: Array<{
      id: string;
      messages?: Array<{ id: string; threadId: string }>;
      messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds: string[] } }>;
      messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
      labelsAdded?: Array<{ message: { id: string; threadId: string; labelIds: string[] }; labelIds: string[] }>;
      labelsRemoved?: Array<{ message: { id: string; threadId: string; labelIds: string[] }; labelIds: string[] }>;
    }>;
    nextPageToken?: string;
    historyId: string;
  }> {
    const params = new URLSearchParams({
      startHistoryId,
    });
    if (historyTypes) {
      for (const type of historyTypes) params.append("historyTypes", type);
    }
    return this.request(`/history?${params.toString()}`);
  }

  // ─── Batch API ───

  /**
   * バッチリクエストで複数のスレッドを一括操作する。
   *
   * 背景: GmailのBatch APIで1リクエストあたり最大100メッセージを処理。
   * 50件の一括アーカイブが2秒以内に完了する要件（spec §5.2）を満たすために使用。
   */
  async batchModifyThreads(
    threadIds: string[],
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ): Promise<void> {
    // Gmail Batch APIのmultipartリクエストを構築
    const boundary = `batch_vantagemail_${Date.now()}`;
    const parts = threadIds.map((threadId, index) => {
      const body = JSON.stringify({ addLabelIds, removeLabelIds });
      return [
        `--${boundary}`,
        `Content-Type: application/http`,
        `Content-ID: <item-${index}>`,
        "",
        `POST /gmail/v1/users/me/threads/${threadId}/modify HTTP/1.1`,
        `Content-Type: application/json`,
        "",
        body,
      ].join("\r\n");
    });

    const batchBody = [...parts, `--${boundary}--`].join("\r\n");

    const response = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "Content-Type": `multipart/mixed; boundary=${boundary}`,
      },
      body: batchBody,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GmailApiError(response.status, error, "/batch");
    }
  }
}

/**
 * Gmail API固有のエラー。
 * ステータスコードとリクエストパスを含む。
 */
export class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Gmail API Error ${status} on ${path}: ${body}`);
    this.name = "GmailApiError";
  }
}
