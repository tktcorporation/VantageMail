/**
 * アカウント一覧 API（GET /api/accounts）・アカウント削除 API（DELETE /api/accounts）。
 *
 * 背景: D1 に保存された linked_accounts からアカウント情報を取得・操作する。
 * クライアントにはトークンを含まない Account 情報のみ返す。
 * SessionService で認証済みかを判定する。
 */
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { Schema } from "@effect/schema"
import type { Account } from "@vantagemail/core"
import { SessionService } from "~/lib/services/SessionService.ts"
import {
  findLinkedAccountsByUserId,
  deleteLinkedAccount,
} from "~/lib/db.ts"
import type { LinkedAccountRow } from "~/lib/db.ts"
import { getEnv, handleEffect } from "~/lib/runtime.ts"

/** D1 の LinkedAccountRow を クライアント向け Account 型に変換する */
function toAccount(row: LinkedAccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    color: row.color,
    unreadCount: 0,
    notificationsEnabled: true,
  }
}

export const Route = createFileRoute("/api/accounts/")({
  server: {
    handlers: {
      /** 連携済みアカウント一覧を返す（トークンは含まない） */
      GET: async () => {
        const env = await getEnv()

        const effect = Effect.gen(function* () {
          const session = yield* SessionService
          const sessionData = yield* session.get()
          const userId = sessionData.userId

          if (!userId) {
            return Response.json({ accounts: [] })
          }

          const rows = yield* findLinkedAccountsByUserId(userId)
          const accounts: Account[] = rows.map(toAccount)
          return Response.json({ accounts })
        })

        return handleEffect(effect, env)
      },

      /** 指定IDのアカウントを削除する */
      DELETE: async ({ request }) => {
        const env = await getEnv()

        /** DELETE リクエストボディの Schema。accountId（文字列）が必須。 */
        const DeleteAccountBody = Schema.Struct({
          accountId: Schema.String,
        })

        const effect = Effect.gen(function* () {
          const session = yield* SessionService

          // request.json() → Schema.decodeUnknown でバリデーション。
          // JSON パース失敗・バリデーション失敗は 400 を返す。
          const jsonResult = yield* Effect.either(
            Effect.tryPromise({
              try: () => request.json() as Promise<unknown>,
              catch: () => new Error("invalid_json"),
            }),
          )
          if (jsonResult._tag === "Left") {
            return Response.json(
              { error: "Invalid JSON body" },
              { status: 400 },
            )
          }

          const parseResult = yield* Effect.either(
            Schema.decodeUnknown(DeleteAccountBody)(jsonResult.right),
          )
          if (parseResult._tag === "Left") {
            return Response.json(
              { error: "accountId is required" },
              { status: 400 },
            )
          }

          const { accountId } = parseResult.right

          const auth = yield* session.requireAuth()

          const deleted = yield* deleteLinkedAccount(auth.userId, accountId)
          if (!deleted) {
            return Response.json(
              { error: "account not found" },
              { status: 404 },
            )
          }

          // セッションの access_token キャッシュからも削除
          yield* session.update((prev) => {
            const cache = { ...prev.accessTokenCache }
            delete cache[accountId]
            return { ...prev, accessTokenCache: cache }
          })

          return Response.json({ ok: true })
        })

        return handleEffect(effect, env)
      },
    },
  },
})
