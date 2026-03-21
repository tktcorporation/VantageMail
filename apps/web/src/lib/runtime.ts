/**
 * Effect ランタイム構築 + ヘルパー。
 *
 * 背景: Cloudflare Workers ではリクエストごとに env bindings が提供されるため、
 * Effect の Layer もリクエストごとに構築する必要がある。
 * makeAppLayer でリクエストスコープの Layer を組み立て、
 * handleEffect で API ルートから簡潔に Effect を実行できるようにする。
 *
 * SessionService の Layer は API ルート側で提供するため、ここでは含まない。
 * （TanStack Start のセッション API はリクエストコンテキストに依存するため）
 */
import { Effect, Layer } from "effect"
import { D1Service, CryptoService, ConfigService } from "./services/index.ts"

/**
 * リクエストスコープの Effect Layer を構築する。
 *
 * SessionService は API ルート側で別途 provide するため、ここには含まない。
 * 呼び出し元で Layer.merge(makeAppLayer(env), SessionService.layer(impl)) のように合成する。
 */
export const makeAppLayer = (env: Cloudflare.Env) =>
  Layer.mergeAll(
    D1Service.layer(env.DB),
    CryptoService.live,
    ConfigService.layer(env),
  )

/** makeAppLayer が提供する Service の union 型（SessionService を除く） */
export type AppServices = D1Service | CryptoService | ConfigService

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
      Effect.catchAll((error) =>
        Effect.succeed(
          Response.json(
            { error: (error as { _tag?: string })._tag ?? "InternalError" },
            { status: 500 },
          ),
        ),
      ),
    ),
  )
