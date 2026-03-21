/**
 * Gmail REST API v1 クライアント（Effect 版）。
 *
 * 背景: クライアントからGmail APIに直接アクセスする。バックエンド（CF Workers）は
 * メール本文を一切参照しない設計（spec §6.4）。このサービスは
 * メッセージ取得、ラベル操作、検索、バッチ処理を担当する。
 *
 * レートリミット: 250クォータユニット/ユーザー/秒。
 * 指数バックオフ付きリトライを Effect.retry で実装（spec §6.5）。
 *
 * 旧クラスベースの GmailClient は GmailClientLegacy として残し、
 * 既存の呼び出し元（apps/web, packages/ui）の互換性を維持する。
 */
import { Context, Effect, Schedule } from "effect"
import { Schema } from "@effect/schema"
import type { ParseError } from "@effect/schema/ParseResult"
import { GmailApiError } from "../errors.js"
import {
  GmailThreadSchema,
  GmailMessageSchema,
  GmailLabelSchema,
  GmailSearchResultSchema,
} from "../schemas/gmail-api.js"
import type {
  GmailThread,
  GmailMessage,
  GmailLabel,
  GmailSearchResult,
} from "../schemas/gmail-api.js"

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

// ─── Effect Service 定義 ───

/**
 * GmailClient サービスの型。
 *
 * 背景: Effect の Context.Tag で DI 可能なサービスとして定義。
 * テスト時にモックに差し替えたり、Layer で構成したりできる。
 */
export interface GmailClientService {
  /**
   * Gmail API にリクエストを送り、レスポンスを Schema でデコードする。
   * 429 レートリミット時は指数バックオフでリトライ（最大3回）。
   */
  readonly request: <A, I>(
    path: string,
    schema: Schema.Schema<A, I>,
    options?: RequestInit,
  ) => Effect.Effect<A, GmailApiError | ParseError>
}

/**
 * GmailClient の Context.Tag。
 *
 * 使い方:
 *   const program = Effect.gen(function* () {
 *     const client = yield* GmailClient
 *     const thread = yield* client.request("/threads/123", GmailThreadSchema)
 *   })
 */
export class GmailClient extends Context.Tag("GmailClient")<
  GmailClient,
  GmailClientService
>() {}

/**
 * 429 レートリミットのリトライポリシー。
 * 1秒 → 2秒 → 4秒 の指数バックオフ、最大3回リトライ。
 * 429 以外のエラーではリトライしない。
 */
const retryPolicy = Schedule.exponential("1 second").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput((err: GmailApiError | ParseError) =>
    err._tag === "GmailApiError" && err.status === 429,
  ),
)

/**
 * GmailClient サービスのファクトリ関数。
 *
 * @param accessToken - Gmail API のアクセストークン
 * @returns GmailClientService の実装
 *
 * 呼び出し元: Layer 構築時に使用。トークンリフレッシュは呼び出し側の責務。
 */
export function makeGmailClient(accessToken: string): GmailClientService {
  return {
    request: <A, I>(
      path: string,
      schema: Schema.Schema<A, I>,
      options?: RequestInit,
    ): Effect.Effect<A, GmailApiError | ParseError> =>
      Effect.tryPromise({
        try: () =>
          fetch(`${GMAIL_API_BASE}${path}`, {
            ...options,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              ...options?.headers,
            },
          }),
        catch: (error) =>
          new GmailApiError({
            status: 0,
            path,
            body: String(error),
          }),
      }).pipe(
        Effect.flatMap((response) => {
          if (!response.ok) {
            return Effect.tryPromise({
              try: () => response.text(),
              catch: () =>
                new GmailApiError({
                  status: response.status,
                  path,
                  body: "Failed to read error response body",
                }),
            }).pipe(
              Effect.flatMap((body) =>
                Effect.fail(
                  new GmailApiError({ status: response.status, path, body }),
                ),
              ),
            )
          }
          return Effect.tryPromise({
            try: () => response.json(),
            catch: (error) =>
              new GmailApiError({
                status: response.status,
                path,
                body: `JSON parse error: ${String(error)}`,
              }),
          })
        }),
        Effect.flatMap((json) => Schema.decodeUnknown(schema)(json)),
        Effect.retry(retryPolicy),
      ),
  }
}

// ─── 便利関数（GmailClient サービスを使う Effect プログラム） ───

/** スレッド一覧のレスポンス Schema */
const ThreadListResponseSchema = Schema.Struct({
  threads: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        historyId: Schema.String,
        snippet: Schema.String,
      }),
    ),
  ),
  nextPageToken: Schema.optional(Schema.String),
  resultSizeEstimate: Schema.Number,
})

/**
 * スレッド一覧を取得する Effect プログラム。
 *
 * @param query - Gmail検索クエリ（例: "is:unread", "from:alice"）
 * @param maxResults - 取得件数（デフォルト50）
 * @param pageToken - ページネーション用トークン
 * @param labelIds - フィルタするラベルID
 */
export function listThreads(options?: {
  query?: string
  maxResults?: number
  pageToken?: string
  labelIds?: string[]
}) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    const params = new URLSearchParams()
    if (options?.query) params.set("q", options.query)
    if (options?.maxResults) params.set("maxResults", String(options.maxResults))
    if (options?.pageToken) params.set("pageToken", options.pageToken)
    if (options?.labelIds) {
      for (const id of options.labelIds) params.append("labelIds", id)
    }
    const queryString = params.toString()
    return yield* client.request(
      `/threads${queryString ? `?${queryString}` : ""}`,
      ThreadListResponseSchema,
    )
  })
}

/**
 * スレッドの詳細を取得する（全メッセージ含む）。
 */
export function getThread(
  threadId: string,
  format: "full" | "metadata" | "minimal" = "full",
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request(
      `/threads/${threadId}?format=${format}`,
      GmailThreadSchema,
    )
  })
}

/**
 * スレッドのラベルを変更する（アーカイブ、ゴミ箱等）。
 */
export function modifyThread(
  threadId: string,
  addLabelIds?: string[],
  removeLabelIds?: string[],
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request(`/threads/${threadId}/modify`, GmailThreadSchema, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    })
  })
}

/**
 * スレッドをゴミ箱に移動する。
 */
export function trashThread(threadId: string) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request(`/threads/${threadId}/trash`, GmailThreadSchema, {
      method: "POST",
    })
  })
}

/**
 * メッセージの詳細を取得する。
 */
export function getMessage(
  messageId: string,
  format: "full" | "metadata" | "minimal" = "full",
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request(
      `/messages/${messageId}?format=${format}`,
      GmailMessageSchema,
    )
  })
}

/**
 * メッセージを送信する。
 */
export function sendMessage(raw: string) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request("/messages/send", GmailMessageSchema, {
      method: "POST",
      body: JSON.stringify({ raw }),
    })
  })
}

/** ラベル一覧のレスポンス Schema */
const LabelListResponseSchema = Schema.Struct({
  labels: Schema.Array(GmailLabelSchema),
})

/**
 * 全ラベルを取得する。
 */
export function listLabels() {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request("/labels", LabelListResponseSchema)
  })
}

/**
 * ラベルを作成する。
 */
export function createLabel(
  name: string,
  options?: {
    labelListVisibility?: string
    messageListVisibility?: string
    color?: { textColor: string; backgroundColor: string }
  },
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    return yield* client.request("/labels", GmailLabelSchema, {
      method: "POST",
      body: JSON.stringify({ name, ...options }),
    })
  })
}

/**
 * Gmail検索演算子を使ったメッセージ検索。
 *
 * 背景: Gmail APIの検索クエリをそのまま渡す。from:, to:, subject:,
 * has:attachment, label:, after:, before: 等の演算子をフルサポート（spec §5.4）。
 */
export function searchMessages(
  query: string,
  maxResults = 20,
  pageToken?: string,
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    })
    if (pageToken) params.set("pageToken", pageToken)
    return yield* client.request(
      `/messages?${params.toString()}`,
      GmailSearchResultSchema,
    )
  })
}

/** History レスポンス Schema */
const HistoryResponseSchema = Schema.Struct({
  history: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        messages: Schema.optional(
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              threadId: Schema.String,
            }),
          ),
        ),
        messagesAdded: Schema.optional(
          Schema.Array(
            Schema.Struct({
              message: Schema.Struct({
                id: Schema.String,
                threadId: Schema.String,
                labelIds: Schema.Array(Schema.String),
              }),
            }),
          ),
        ),
        messagesDeleted: Schema.optional(
          Schema.Array(
            Schema.Struct({
              message: Schema.Struct({
                id: Schema.String,
                threadId: Schema.String,
              }),
            }),
          ),
        ),
        labelsAdded: Schema.optional(
          Schema.Array(
            Schema.Struct({
              message: Schema.Struct({
                id: Schema.String,
                threadId: Schema.String,
                labelIds: Schema.Array(Schema.String),
              }),
              labelIds: Schema.Array(Schema.String),
            }),
          ),
        ),
        labelsRemoved: Schema.optional(
          Schema.Array(
            Schema.Struct({
              message: Schema.Struct({
                id: Schema.String,
                threadId: Schema.String,
                labelIds: Schema.Array(Schema.String),
              }),
              labelIds: Schema.Array(Schema.String),
            }),
          ),
        ),
      }),
    ),
  ),
  nextPageToken: Schema.optional(Schema.String),
  historyId: Schema.String,
})

/**
 * history.listによるインクリメンタル同期。
 *
 * 背景: プッシュ通知（Pub/Sub）受信後にhistory.listで差分を取得し、
 * ローカルのスレッドストアを更新する（spec §6.5）。
 * フル同期（messages.list）よりもAPIクォータを節約できる。
 */
export function listHistory(
  startHistoryId: string,
  historyTypes?: Array<
    "messageAdded" | "messageDeleted" | "labelAdded" | "labelRemoved"
  >,
) {
  return Effect.gen(function* () {
    const client = yield* GmailClient
    const params = new URLSearchParams({ startHistoryId })
    if (historyTypes) {
      for (const type of historyTypes) params.append("historyTypes", type)
    }
    return yield* client.request(
      `/history?${params.toString()}`,
      HistoryResponseSchema,
    )
  })
}

