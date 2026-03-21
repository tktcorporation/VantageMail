/**
 * Gmail同期マネージャー（Effect 版）。
 *
 * 背景: Gmail APIからスレッドを取得し、アプリ内の型に変換してストアに反映する。
 * 初回ロード時はmessages.listでフル同期、以降はhistory.listで差分同期。
 * Pub/Subプッシュ通知受信時にインクリメンタル同期をトリガーする（spec §6.5）。
 *
 * 呼び出し元: UIのアカウント追加時、プッシュ通知受信時
 * 対になるモジュール: gmail/client.ts（API通信）、gmail/adapter.ts（型変換）
 */
import { Effect } from "effect"
import type { ParseError } from "@effect/schema/ParseResult"
import { GmailClient, listThreads, getThread, listHistory } from "./client.js"
import { adaptGmailThread } from "./adapter.js"
import { GmailApiError } from "../errors.js"
import type { Thread } from "../schemas/thread.js"
import type { StoreApi } from "zustand"
import type { ThreadsStore } from "../stores/threads.js"

export interface SyncOptions {
  /** 取得する最大スレッド数（デフォルト50） */
  maxResults?: number
  /** 受信トレイのみ同期するか（デフォルトtrue） */
  inboxOnly?: boolean
}

/**
 * アカウントのスレッドを初回ロードする Effect プログラム。
 *
 * Gmail APIからスレッド一覧を取得し、各スレッドの詳細を並列で取得して、
 * アプリ内の型に変換してストアに設定する。
 *
 * GmailClient サービスが Context に必要。
 */
export function syncAccountThreads(
  accountId: string,
  threadsStore: StoreApi<ThreadsStore>,
  options?: SyncOptions,
): Effect.Effect<void, GmailApiError | ParseError, GmailClient> {
  const maxResults = options?.maxResults ?? 50
  const labelIds = options?.inboxOnly !== false ? ["INBOX"] : undefined

  return Effect.gen(function* () {
    threadsStore.getState().setLoading(true)

    try {
      // スレッドID一覧を取得
      const listResult = yield* listThreads({ maxResults, labelIds })
      if (!listResult.threads?.length) {
        threadsStore.getState().setThreads(accountId, [])
        return
      }

      // 各スレッドの詳細を並列で取得（最大10件ずつバッチ処理）
      const threads: Thread[] = []
      const batchSize = 10

      for (let i = 0; i < listResult.threads.length; i += batchSize) {
        const batch = listResult.threads.slice(i, i + batchSize)
        const batchResults = yield* Effect.all(
          batch.map((t) => getThread(t.id, "metadata")),
          { concurrency: batchSize },
        )
        for (const gmailThread of batchResults) {
          threads.push(adaptGmailThread(gmailThread, accountId))
        }
      }

      threadsStore.getState().setThreads(accountId, threads)
    } finally {
      threadsStore.getState().setLoading(false)
    }
  })
}

/**
 * history.listを使ったインクリメンタル同期の Effect プログラム。
 *
 * 背景: フル同期は重いので、前回の同期以降の変更のみを取得する。
 * Pub/Sub通知を受け取った後にこの関数を呼ぶことで、
 * 最小限のAPI呼び出しでストアを最新状態に保つ。
 *
 * @returns 最新の historyId（次回の同期で使用）
 */
export function incrementalSync(
  accountId: string,
  threadsStore: StoreApi<ThreadsStore>,
  lastHistoryId: string,
): Effect.Effect<string, GmailApiError | ParseError, GmailClient> {
  return Effect.gen(function* () {
    const result = yield* listHistory(lastHistoryId, [
      "messageAdded",
      "messageDeleted",
      "labelAdded",
      "labelRemoved",
    ])

    if (!result.history?.length) {
      return result.historyId
    }

    // 変更されたスレッドIDを収集
    const changedThreadIds = new Set<string>()
    for (const entry of result.history) {
      for (const added of entry.messagesAdded ?? []) {
        changedThreadIds.add(added.message.threadId)
      }
      for (const deleted of entry.messagesDeleted ?? []) {
        changedThreadIds.add(deleted.message.threadId)
      }
      for (const labelChange of [
        ...(entry.labelsAdded ?? []),
        ...(entry.labelsRemoved ?? []),
      ]) {
        changedThreadIds.add(labelChange.message.threadId)
      }
    }

    // 変更されたスレッドの詳細を再取得
    if (changedThreadIds.size > 0) {
      const updatedThreads = yield* Effect.all(
        [...changedThreadIds].map((threadId) =>
          getThread(threadId, "metadata").pipe(
            Effect.map(
              (gmailThread) => adaptGmailThread(gmailThread, accountId) as Thread | null,
            ),
            // スレッドが削除された場合はnullを返す
            Effect.catchAll(() => Effect.succeed(null as Thread | null)),
          ),
        ),
        { concurrency: 10 },
      )

      // 既存のスレッドマップに更新を適用
      const state = threadsStore.getState()
      const existingThreads = state.threadsByAccount[accountId] ?? {}
      const mergedThreads = { ...existingThreads }

      for (const thread of updatedThreads) {
        if (thread) {
          mergedThreads[thread.id] = thread
        }
      }

      state.setThreads(accountId, Object.values(mergedThreads))
    }

    return result.historyId
  })
}
