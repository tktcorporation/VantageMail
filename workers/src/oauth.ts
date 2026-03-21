/**
 * OAuth トークン交換・リフレッシュ。
 *
 * 背景: Google OAuth 2.0 の client_secret をサーバー側に保持し、
 * トークン交換とリフレッシュを仲介するプロキシ。
 * メール本文やユーザーデータには一切アクセスしない。
 *
 * 注: apps/web の TanStack Start サーバールートに移行済みだが、
 * 既存クライアントとの後方互換のために残している。
 */
import { Effect } from "effect"
import type { Env } from "./index"
import { corsHeaders } from "./index"

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

export async function handleOAuth(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsOrigin)
  }

  const url = new URL(request.url)

  switch (url.pathname) {
    case "/oauth/token":
      return Effect.runPromise(tokenExchange(request, env, corsOrigin))
    case "/oauth/refresh":
      return Effect.runPromise(tokenRefresh(request, env, corsOrigin))
    default:
      return json({ error: "Not found" }, 404, corsOrigin)
  }
}

/**
 * 認可コード → トークン交換。
 *
 * クライアントから受け取った authorization code と code_verifier を使い、
 * サーバー側の client_secret を付加して Google トークンエンドポイントに交換を要求する。
 */
const tokenExchange = (
  request: Request,
  env: Env,
  corsOrigin: string,
): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.formData(),
      catch: () => new Error("Invalid request body"),
    })

    const clientId = body.get("client_id")
    const code = body.get("code")
    const codeVerifier = body.get("code_verifier")
    const redirectUri = body.get("redirect_uri")

    if (!clientId || !code || !codeVerifier || !redirectUri) {
      return json({ error: "Missing required parameters" }, 400, corsOrigin)
    }

    const tokenBody = new URLSearchParams({
      client_id: clientId as string,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      code: code as string,
      code_verifier: codeVerifier as string,
      grant_type: "authorization_code",
      redirect_uri: redirectUri as string,
    })

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        }),
      catch: (e) => new Error(`Token exchange fetch failed: ${e}`),
    })

    const data = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (e) => new Error(`Token exchange JSON parse failed: ${e}`),
    })

    return json(data, response.status, corsOrigin)
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        json({ error: (error as Error).message }, 500, corsOrigin),
      ),
    ),
  )

/**
 * リフレッシュトークン → 新しいアクセストークン。
 *
 * クライアントから受け取った refresh_token を使い、
 * サーバー側の client_secret を付加して新しいアクセストークンを取得する。
 */
const tokenRefresh = (
  request: Request,
  env: Env,
  corsOrigin: string,
): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.formData(),
      catch: () => new Error("Invalid request body"),
    })

    const clientId = body.get("client_id")
    const refreshToken = body.get("refresh_token")

    if (!clientId || !refreshToken) {
      return json({ error: "Missing required parameters" }, 400, corsOrigin)
    }

    const tokenBody = new URLSearchParams({
      client_id: clientId as string,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken as string,
      grant_type: "refresh_token",
    })

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        }),
      catch: (e) => new Error(`Token refresh fetch failed: ${e}`),
    })

    const data = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (e) => new Error(`Token refresh JSON parse failed: ${e}`),
    })

    return json(data, response.status, corsOrigin)
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        json({ error: (error as Error).message }, 500, corsOrigin),
      ),
    ),
  )

function json(data: unknown, status: number, corsOrigin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(corsOrigin) },
  })
}
