/**
 * メインルート（/）— VantageMail のメール UI。
 *
 * 背景: TanStack Start のファイルベースルーティングにより、
 * このファイルが / パスに自動マッピングされる。
 *
 * loader でサーバーサイドのセッションからユーザーID を取得し、
 * D1 からアカウント一覧を取得してクライアントに渡す。
 * トークンはサーバー側に残り、クライアントには表示用の Account 情報のみが届く。
 *
 * 未ログインの場合は空のアカウント一覧を返す（UI 側でログインボタンを表示）。
 */
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import type { Account } from "@vantagemail/core"
import { SessionService } from "~/lib/services/SessionService.ts"
import { findLinkedAccountsByUserId } from "~/lib/db.ts"
import type { LinkedAccountRow } from "~/lib/db.ts"
import { getEnv, makeAppLayer } from "~/lib/runtime.ts"
import { AppShell } from "~/components/app-shell"

/**
 * セッションからユーザーIDを取得し、D1 からアカウント一覧を取得するサーバー関数。
 * トークンは除外し、表示用の Account のみ返す。
 *
 * Effect を使って SessionService / D1Service に依存する処理を表現し、
 * makeAppLayer で全 Service を provide して実行する。
 */
const getAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Account[]> => {
    const env = await getEnv()

    const effect = Effect.gen(function* () {
      const session = yield* SessionService
      const sessionData = yield* session.get()
      const userId = sessionData.userId
      if (!userId) return [] as Account[]

      const rows = yield* findLinkedAccountsByUserId(userId)
      return rows.map((row: LinkedAccountRow): Account => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url ?? undefined,
        color: row.color,
        unreadCount: 0,
        notificationsEnabled: true,
      }))
    })

    return Effect.runPromise(
      effect.pipe(
        Effect.provide(makeAppLayer(env)),
        // 認証エラー時は空配列を返す（未ログイン状態として扱う）
        Effect.catchAll(() => Effect.succeed([] as Account[])),
      ),
    )
  },
)

export const Route = createFileRoute("/")({
  loader: async () => {
    const accounts = await getAccounts()
    return { accounts }
  },
  component: IndexPage,
})

function IndexPage() {
  const { accounts } = Route.useLoaderData()
  return <AppShell initialAccounts={accounts} />
}
