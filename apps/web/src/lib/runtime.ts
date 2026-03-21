/**
 * Effect ランタイム構築 + ヘルパー。
 *
 * 背景: Cloudflare Workers ではリクエストごとに env bindings が提供されるため、
 * Effect の Layer もリクエストごとに構築する必要がある。
 * makeAppLayer でリクエストスコープの Layer を組み立て、
 * handleEffect で API ルートから簡潔に Effect を実行できるようにする。
 *
 * SessionService.live は TanStack Start のリクエストコンテキストに依存するため、
 * ここで Layer に含める（サーバー関数・API ルートハンドラ内でのみ有効）。
 */
import { Effect, Layer } from "effect"
import { D1Service, CryptoService, ConfigService, SessionService } from "./services/index.ts"

/**
 * リクエストスコープの Effect Layer を構築する。
 *
 * D1Service, CryptoService, ConfigService, SessionService を全て含む。
 * SessionService.live は ConfigService から sessionSecret を受け取り、
 * TanStack Start のセッション API を使う。
 * サーバー関数・API ルートハンドラ内で呼ばれる前提。
 *
 * SessionService は ConfigService に依存するため、ConfigService.layer を
 * SessionService の構築に使い、最終的に全 Layer をマージする。
 */
export const makeAppLayer = (env: Cloudflare.Env) => {
  const configLayer = ConfigService.layer(env)

  // ConfigService から sessionSecret を取得して SessionService を構築する Layer
  const sessionLayer = Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* ConfigService
      return SessionService.live(config.sessionSecret)
    }),
  ).pipe(Layer.provide(configLayer))

  return Layer.mergeAll(
    D1Service.layer(env.DB),
    CryptoService.live,
    configLayer,
    sessionLayer,
  )
}

/** makeAppLayer が提供する Service の union 型 */
export type AppServices = D1Service | CryptoService | ConfigService | SessionService

/**
 * Cloudflare Workers の env bindings を取得する。
 *
 * 背景: TanStack Start + Cloudflare Workers では `cloudflare:workers` モジュールから
 * env オブジェクトをインポートして D1 バインディング等にアクセスする。
 * このモジュールはビルド時に Cloudflare のバンドラが解決する。
 */
export const getEnv = async (): Promise<Cloudflare.Env> => {
  const { env } = await import("cloudflare:workers" as string)
  return env as Cloudflare.Env
}

/**
 * API ルートで Effect を実行するヘルパー。
 *
 * Layer を provide し、未処理のエラーを JSON レスポンスに変換する。
 * エラーの _tag フィールドをレスポンスに含めることで、クライアント側で
 * エラー種別を判定できる。
 *
 * 使い方:
 *   return handleEffect(myEffect, env)
 */
export const handleEffect = <E>(
  effect: Effect.Effect<Response, E, AppServices>,
  env: Cloudflare.Env,
): Promise<Response> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(makeAppLayer(env)),
      Effect.catchAll((error: unknown) => {
        const tag =
          typeof error === "object" &&
          error !== null &&
          "_tag" in error &&
          typeof (error as Record<string, unknown>)._tag === "string"
            ? ((error as Record<string, unknown>)._tag as string)
            : "InternalError"
        return Effect.succeed(
          Response.json({ error: tag }, { status: 500 }),
        )
      }),
    ),
  )
