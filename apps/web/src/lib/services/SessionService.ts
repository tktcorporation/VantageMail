/**
 * セッション操作の Effect Service。
 *
 * 背景: TanStack Start のセッション（暗号化 Cookie）を Effect で型安全に操作する。
 * セッションの読み書きで発生するエラーを SessionError / NotAuthenticated として
 * 型レベルで追跡し、呼び出し側でハンドリング漏れを防ぐ。
 *
 * 使用箇所: OAuth コールバック、API ルート、認証ガード
 */
import { Context, Effect, Layer } from "effect"
import { SessionError, NotAuthenticated } from "@vantagemail/core"
import { getSession, updateSession } from "@tanstack/react-start/server"
import { getSessionConfig, type AppSessionData } from "../session.ts"

export interface SessionServiceImpl {
  /** 現在のセッションデータを読み出す */
  get: () => Effect.Effect<AppSessionData, SessionError>
  /** セッションデータを更新する（前の値を受け取って新しい値を返す関数を渡す） */
  update: (fn: (prev: AppSessionData) => AppSessionData) => Effect.Effect<void, SessionError>
  /** セッションをクリアする（ログアウト時） */
  clear: () => Effect.Effect<void, SessionError>
  /** 認証済みであることを要求し、userId と dek を返す。未認証なら NotAuthenticated */
  requireAuth: () => Effect.Effect<{ userId: string; dek: string }, NotAuthenticated>
}

export class SessionService extends Context.Tag("SessionService")<
  SessionService,
  SessionServiceImpl
>() {
  /** 手動で実装を渡す場合（テスト等） */
  static layer = (impl: SessionServiceImpl) =>
    Layer.succeed(SessionService, impl)

  /**
   * TanStack Start のセッション API を使った実装の Layer。
   *
   * 背景: getSession / updateSession は TanStack Start のリクエストコンテキストに依存し、
   * サーバー関数・API ルートハンドラ内でのみ呼び出せる。
   * この Layer はリクエストごとに Layer.succeed で構築され、
   * makeAppLayer と合成して Effect に provide する。
   */
  static live = Layer.succeed(SessionService, {
    get: () =>
      Effect.tryPromise({
        try: async () => {
          const session = await getSession<AppSessionData>(getSessionConfig())
          return session.data
        },
        catch: (e) => new SessionError({ reason: String(e) }),
      }),

    update: (fn) =>
      Effect.tryPromise({
        try: () => updateSession<AppSessionData>(getSessionConfig(), fn),
        catch: (e) => new SessionError({ reason: String(e) }),
      }),

    clear: () =>
      Effect.tryPromise({
        try: () =>
          updateSession<AppSessionData>(getSessionConfig(), () => ({
            userId: undefined,
            dek: undefined,
            codeVerifier: undefined,
            accessTokenCache: undefined,
          })),
        catch: (e) => new SessionError({ reason: String(e) }),
      }),

    requireAuth: () =>
      Effect.gen(function* () {
        const data = yield* Effect.tryPromise({
          try: async () => {
            const session = await getSession<AppSessionData>(getSessionConfig())
            return session.data
          },
          catch: (e) => new NotAuthenticated(),
        })
        if (!data.userId || !data.dek) {
          return yield* Effect.fail(new NotAuthenticated())
        }
        return { userId: data.userId, dek: data.dek }
      }),
  })
}
