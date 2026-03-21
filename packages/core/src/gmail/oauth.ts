/**
 * Google OAuth 2.0 PKCE フローの実装（Effect 版）。
 *
 * 背景: Gmail APIへのアクセスにはOAuth 2.0認証が必要。パブリッククライアント
 * （デスクトップ/Webアプリ）ではPKCEフローを使い、client_secretなしで
 * セキュアに認証する。Cloudflare Workerがトークン交換プロキシとして機能し、
 * client_secretはサーバー側に保持する（spec §6.4）。
 *
 * フロー:
 * 1. クライアントがcode_verifierを生成
 * 2. Google認可エンドポイントにリダイレクト（code_challenge付き）
 * 3. ユーザーが認可
 * 4. コールバックでauthorization_codeを受け取る
 * 5. CF Workerのプロキシ経由でcode → トークン交換
 *
 * ブラウザの crypto API を使用するため、tsconfig の DOM lib が必要。
 */

import { Effect } from "effect"
import { Schema } from "@effect/schema"
import type { OAuthTokens } from "../schemas/account.js"
import { OAuthTokenResponseSchema, GoogleUserInfoSchema } from "../schemas/gmail-api.js"
import type { GoogleUserInfo } from "../schemas/gmail-api.js"
import { TokenExchangeError } from "../errors.js"

/**
 * Gmail APIに必要なOAuthスコープ。
 *
 * 背景: gmail.readonlyではなくgmail.modifyを使う。
 * アーカイブ（removeLabel INBOX）やラベル操作にmodifyが必要（spec §6.5）。
 * Restricted Scopeのため、一般公開にはCASA監査が必須（spec §11.2）。
 */
const GMAIL_SCOPES = [
  // openid: id_token を取得するために必要。google_sub（不変ユーザーID）の
  // 安全な取得に使う。マルチアカウント認証のユーザー識別に必須。
  "openid",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
]

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo"

export interface OAuthConfig {
  clientId: string
  redirectUri: string
  /**
   * OAuth プロキシの基底URL。
   *
   * 省略時は同一オリジンの /api/oauth/* を使用する（TanStack Start サーバールート）。
   * 別オリジンの Worker を使う場合のみ設定する（例: "https://api.example.com"）。
   */
  proxyBaseUrl?: string
}

/**
 * PKCE用のcode_verifierとcode_challengeのペアを生成する。
 *
 * 背景: PKCEはパブリッククライアントのセキュリティを強化する仕組み。
 * code_verifierはランダムな文字列、code_challengeはそのSHA-256ハッシュ。
 * 認可リクエスト時にchallengeを、トークン交換時にverifierを送ることで、
 * 認可コードの横取り攻撃を防ぐ。
 */
function generatePKCEPair(): Effect.Effect<
  { codeVerifier: string; codeChallenge: string },
  TokenExchangeError
> {
  return Effect.tryPromise({
    try: async () => {
      const array = new Uint8Array(32)
      crypto.getRandomValues(array)
      const codeVerifier = base64UrlEncode(array)

      const encoder = new TextEncoder()
      const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(codeVerifier),
      )
      const codeChallenge = base64UrlEncode(new Uint8Array(digest))

      return { codeVerifier, codeChallenge }
    },
    catch: (error) =>
      new TokenExchangeError({
        status: 0,
        details: `PKCE pair generation failed: ${String(error)}`,
      }),
  })
}

/** Base64urlエンコード（RFC 7636準拠） */
function base64UrlEncode(buffer: Uint8Array): string {
  let str = ""
  for (const byte of buffer) {
    str += String.fromCharCode(byte)
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Google OAuth認可URLを生成する。
 * ブラウザをこのURLにリダイレクトして認可フローを開始する。
 *
 * @returns 認可URLとPKCE code_verifier（トークン交換時に必要なのでセッションに保存すること）
 */
export function createAuthorizationUrl(
  config: OAuthConfig,
): Effect.Effect<{ url: string; codeVerifier: string }, TokenExchangeError> {
  return Effect.gen(function* () {
    const { codeVerifier, codeChallenge } = yield* generatePKCEPair()

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      // 毎回リフレッシュトークンを発行させる
      prompt: "consent",
    })

    return {
      url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      codeVerifier,
    }
  })
}

/**
 * 認可コードをOAuthトークンに交換する。
 *
 * 同一オリジンの /api/oauth/token サーバールートを経由してトークン交換する。
 * サーバー側で client_secret を付与するため、クライアントに秘密情報は不要。
 * proxyBaseUrl が設定されている場合はそのオリジンの API を使用する。
 */
export function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Effect.Effect<OAuthTokens, TokenExchangeError> {
  return Effect.gen(function* () {
    const tokenUrl = `${config.proxyBaseUrl ?? ""}/api/oauth/token`

    const body = new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    })

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
      catch: (error) =>
        new TokenExchangeError({
          status: 0,
          details: `Token exchange fetch failed: ${String(error)}`,
        }),
    })

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new TokenExchangeError({
            status: response.status,
            details: "Failed to read error response body",
          }),
      })
      return yield* Effect.fail(
        new TokenExchangeError({
          status: response.status,
          details: `トークン交換に失敗: ${errorText}`,
        }),
      )
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new TokenExchangeError({
          status: response.status,
          details: `JSON parse error: ${String(error)}`,
        }),
    })

    const data = yield* Schema.decodeUnknown(OAuthTokenResponseSchema)(json).pipe(
      Effect.mapError(
        (parseError) =>
          new TokenExchangeError({
            status: response.status,
            details: `Token response validation failed: ${String(parseError)}`,
          }),
      ),
    )

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? "",
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    }
  })
}

/**
 * リフレッシュトークンを使ってアクセストークンを更新する。
 * トークンの有効期限切れ時に自動的に呼ばれる。
 */
export function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Effect.Effect<OAuthTokens, TokenExchangeError> {
  return Effect.gen(function* () {
    const refreshUrl = `${config.proxyBaseUrl ?? ""}/api/oauth/refresh`

    const body = new URLSearchParams({
      client_id: config.clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
      catch: (error) =>
        new TokenExchangeError({
          status: 0,
          details: `Token refresh fetch failed: ${String(error)}`,
        }),
    })

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new TokenExchangeError({
            status: response.status,
            details: "Failed to read error response body",
          }),
      })
      return yield* Effect.fail(
        new TokenExchangeError({
          status: response.status,
          details: `トークン更新に失敗: ${errorText}`,
        }),
      )
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new TokenExchangeError({
          status: response.status,
          details: `JSON parse error: ${String(error)}`,
        }),
    })

    const data = yield* Schema.decodeUnknown(OAuthTokenResponseSchema)(json).pipe(
      Effect.mapError(
        (parseError) =>
          new TokenExchangeError({
            status: response.status,
            details: `Token response validation failed: ${String(parseError)}`,
          }),
      ),
    )

    return {
      accessToken: data.access_token,
      // リフレッシュ時には新しいrefresh_tokenが返らない場合がある
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    }
  })
}

/**
 * Googleユーザー情報を取得する。
 * OAuth認証後にアカウントのdisplayNameとavatarUrlを設定するために使用。
 */
export function fetchUserInfo(
  accessToken: string,
): Effect.Effect<GoogleUserInfo, TokenExchangeError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(GOOGLE_USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      catch: (error) =>
        new TokenExchangeError({
          status: 0,
          details: `UserInfo fetch failed: ${String(error)}`,
        }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new TokenExchangeError({
          status: response.status,
          details: `ユーザー情報の取得に失敗: ${response.status}`,
        }),
      )
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) =>
        new TokenExchangeError({
          status: response.status,
          details: `JSON parse error: ${String(error)}`,
        }),
    })

    return yield* Schema.decodeUnknown(GoogleUserInfoSchema)(json).pipe(
      Effect.mapError(
        (parseError) =>
          new TokenExchangeError({
            status: response.status,
            details: `UserInfo validation failed: ${String(parseError)}`,
          }),
      ),
    )
  })
}

