/**
 * OAuth 認証開始 API（POST /api/auth/start）。
 *
 * 背景: PKCE code_verifier の生成と保管をサーバーサイドで行う。
 * code_verifier を暗号化セッションに保存し、クライアントには認可URLだけ返す。
 * これにより sessionStorage に秘密情報を置く必要がなくなる。
 *
 * フロー: クライアントがこのAPIを呼ぶ → PKCE生成 → セッションに保存 → 認可URL返却
 */
import { createFileRoute } from "@tanstack/react-router"
import { getRequestUrl } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { createAuthorizationUrlEffect, type TokenExchangeError } from "@vantagemail/core"
import { SessionService } from "~/lib/services/SessionService.ts"
import { getEnv, handleEffect } from "~/lib/runtime.ts"

export const Route = createFileRoute("/api/auth/start")({
  server: {
    handlers: {
      POST: async () => {
        const env = await getEnv()

        const effect = Effect.gen(function* () {
          const session = yield* SessionService

          // VITE_ prefixed vars are inlined at build time via import.meta.env.
          // process.env.VITE_* is NOT available at Worker runtime.
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
          if (!clientId) {
            return Response.json(
              { error: "VITE_GOOGLE_CLIENT_ID is not configured" },
              { status: 500 },
            )
          }

          const requestUrl = getRequestUrl()
          const redirectUri =
            import.meta.env.VITE_OAUTH_REDIRECT_URI ??
            `${requestUrl.origin}/oauth/callback`

          const { url, codeVerifier } = yield* createAuthorizationUrlEffect({
            clientId,
            redirectUri,
          })

          // code_verifier を暗号化セッションに保存（コールバック時に使用）
          yield* session.update((prev) => ({
            ...prev,
            codeVerifier,
          }))

          return Response.json({ url })
        })

        return handleEffect(effect, env)
      },
    },
  },
})
