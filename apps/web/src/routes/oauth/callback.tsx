/**
 * OAuth コールバックルート（GET /oauth/callback）。
 *
 * 背景: Google OAuth 認証後のリダイレクト先。3つのケースを処理する:
 *
 * 1. 新規ユーザー: google_sub が DB にない → ユーザー作成 + DEK 生成 + アカウント登録
 * 2. 既存ユーザーのログイン: google_sub が DB にある → KEK 再導出 → DEK 復号 → セッション復元
 * 3. アカウント追加: セッションに userId がある → 別の Gmail を linked_accounts に追加
 *
 * セキュリティ:
 * - id_token から google_sub を取得（改ざん不可、Google が署名）
 * - refresh_token は DEK で暗号化して D1 に保存
 * - DEK は KEK = HKDF(SERVER_SECRET, google_sub) で暗号化して D1 に保存
 * - access_token はセッションにキャッシュのみ（DB に保存しない）
 *
 * 全ロジックを Effect.gen で表現し、SessionService / CryptoService / D1Service /
 * ConfigService への依存を型レベルで追跡する。
 */
import { createFileRoute } from "@tanstack/react-router"
import { getRequestUrl } from "@tanstack/react-start/server"
import { Effect } from "effect"
import {
  TokenExchangeError,
  GoogleSubExtractionError,
  RefreshTokenMissing,
} from "@vantagemail/core"
import { SessionService } from "~/lib/services/SessionService.ts"
import { CryptoService } from "~/lib/services/CryptoService.ts"
import { ConfigService } from "~/lib/services/ConfigService.ts"
import {
  findUserByGoogleSub,
  createUser,
  updateUserProfile,
  findLinkedAccountByEmail,
  findLinkedAccountsByUserId,
  createLinkedAccount,
  updateLinkedAccountToken,
  updateLinkedAccountProfile,
} from "~/lib/db.ts"
import type { LinkedAccountRow } from "~/lib/db.ts"
import { getEnv, handleEffect } from "~/lib/runtime.ts"
import { uint8ToBase64 } from "~/lib/crypto.ts"

/** アカウントに割り当てるカラーのプール */
const ACCOUNT_COLORS = [
  "#228be6",
  "#40c057",
  "#fab005",
  "#fa5252",
  "#7950f2",
  "#e64980",
  "#15aabf",
  "#fd7e14",
]

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_ENDPOINT =
  "https://www.googleapis.com/oauth2/v2/userinfo"
/**
 * Google ID Token からクレームを取得するエンドポイント。
 * google_sub（不変のユーザー識別子）を安全に取得するために使う。
 */
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"

/** トークン交換で取得するデータ */
interface VerifiedTokenData {
  access_token: string
  refresh_token: string
  id_token: string
  expires_in: number
  scope: string
}

/** Google ユーザー情報 */
interface UserInfo {
  email: string
  name: string
  picture?: string
}

// --- Effect ヘルパー関数 ---

/**
 * Google Token Endpoint で認可コードをトークンに交換する。
 */
const exchangeCode = (
  code: string,
  codeVerifier: string,
  origin: string,
): Effect.Effect<VerifiedTokenData, TokenExchangeError | RefreshTokenMissing> =>
  Effect.gen(function* () {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri =
      import.meta.env.VITE_OAUTH_REDIRECT_URI ?? `${origin}/oauth/callback`

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    })

    const tokenResponse = yield* Effect.tryPromise({
      try: () =>
        fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        }),
      catch: (e) =>
        new TokenExchangeError({
          status: 0,
          details: `Token exchange fetch failed: ${String(e)}`,
        }),
    })

    if (!tokenResponse.ok) {
      const errText = yield* Effect.tryPromise({
        try: () => tokenResponse.text(),
        catch: () =>
          new TokenExchangeError({
            status: tokenResponse.status,
            details: "Failed to read error response",
          }),
      })
      return yield* Effect.fail(
        new TokenExchangeError({
          status: tokenResponse.status,
          details: errText,
        }),
      )
    }

    const tokenData = yield* Effect.tryPromise({
      try: () =>
        tokenResponse.json() as Promise<{
          access_token: string
          refresh_token?: string
          id_token: string
          expires_in: number
          scope: string
        }>,
      catch: (e) =>
        new TokenExchangeError({
          status: tokenResponse.status,
          details: `JSON parse error: ${String(e)}`,
        }),
    })

    if (!tokenData.refresh_token) {
      return yield* Effect.fail(new RefreshTokenMissing())
    }

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      id_token: tokenData.id_token,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    }
  })

/**
 * Google ID Token を検証し、google_sub（不変ユーザーID）を取得する。
 *
 * 背景: id_token は JWT 形式だが、ローカルで署名検証するのではなく
 * Google の tokeninfo エンドポイントに検証を委譲する。
 */
const extractGoogleSub = (
  idToken: string,
): Effect.Effect<string, GoogleSubExtractionError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`,
        ),
      catch: (e) =>
        new GoogleSubExtractionError({
          reason: `tokeninfo fetch failed: ${String(e)}`,
        }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new GoogleSubExtractionError({
          reason: `tokeninfo verification failed: ${response.status}`,
        }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ sub?: string; aud?: string }>,
      catch: (e) =>
        new GoogleSubExtractionError({
          reason: `tokeninfo JSON parse failed: ${String(e)}`,
        }),
    })

    // aud が自分のクライアントID と一致することを確認
    const expectedClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (data.aud !== expectedClientId) {
      return yield* Effect.fail(
        new GoogleSubExtractionError({
          reason: `id_token aud mismatch: ${data.aud} expected: ${expectedClientId}`,
        }),
      )
    }

    if (!data.sub) {
      return yield* Effect.fail(
        new GoogleSubExtractionError({ reason: "sub claim missing" }),
      )
    }

    return data.sub
  })

/**
 * Google UserInfo API でプロフィールを取得する。
 */
const fetchUserInfo = (
  accessToken: string,
): Effect.Effect<UserInfo, TokenExchangeError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(GOOGLE_USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      catch: (e) =>
        new TokenExchangeError({
          status: 0,
          details: `UserInfo fetch failed: ${String(e)}`,
        }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new TokenExchangeError({
          status: response.status,
          details: `UserInfo fetch failed: ${response.status}`,
        }),
      )
    }

    return yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          email: string
          name: string
          picture?: string
        }>,
      catch: (e) =>
        new TokenExchangeError({
          status: response.status,
          details: `UserInfo JSON parse failed: ${String(e)}`,
        }),
    })
  })

/**
 * ケース1: 新規ユーザー登録。
 * DEK を生成し、KEK で暗号化して users テーブルに保存。
 * refresh_token を DEK で暗号化して linked_accounts に保存。
 */
const handleNewUser = (
  googleSub: string,
  userInfo: UserInfo,
  tokenData: VerifiedTokenData,
) =>
  Effect.gen(function* () {
    const session = yield* SessionService
    const cryptoSvc = yield* CryptoService
    const config = yield* ConfigService

    const userId = crypto.randomUUID()
    const accountId = crypto.randomUUID()

    // DEK 生成 → KEK で暗号化
    const dekBytes = yield* cryptoSvc.generateDEK()
    const kek = yield* cryptoSvc.deriveKEK(config.serverSecret, googleSub)
    const encryptedDEK = yield* cryptoSvc.encryptDEK(kek, dekBytes)

    // refresh_token を DEK で暗号化
    const dekKey = yield* cryptoSvc.importDEK(dekBytes)
    const encryptedToken = yield* cryptoSvc.encrypt(
      dekKey,
      tokenData.refresh_token,
    )

    // users テーブルに保存
    yield* createUser({
      id: userId,
      google_sub: googleSub,
      email: userInfo.email,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
      encrypted_dek: encryptedDEK.ciphertext,
      dek_iv: encryptedDEK.iv,
    })

    // linked_accounts にメインアカウントを保存
    yield* createLinkedAccount({
      id: accountId,
      user_id: userId,
      email: userInfo.email,
      google_sub: googleSub,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
      color: ACCOUNT_COLORS[0],
      encrypted_refresh_token: encryptedToken.ciphertext,
      refresh_token_iv: encryptedToken.iv,
      token_scope: tokenData.scope,
    })

    // セッションに保存
    // 新規ユーザーでも ...prev で codeVerifier 等の既存セッションデータを安全にクリアする
    const dekBase64 = uint8ToBase64(dekBytes)
    yield* session.update((prev) => ({
      ...prev,
      userId,
      dek: dekBase64,
      codeVerifier: undefined,
      accessTokenCache: {
        [accountId]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }))
  })

/**
 * ケース2: 既存ユーザーのログイン。
 * KEK を再導出して DEK を復号し、セッションに保存。
 */
const handleExistingUser = (
  existingUser: { id: string; encrypted_dek: string; dek_iv: string },
  googleSub: string,
  userInfo: UserInfo,
  tokenData: VerifiedTokenData,
) =>
  Effect.gen(function* () {
    const session = yield* SessionService
    const cryptoSvc = yield* CryptoService
    const config = yield* ConfigService

    // KEK を再導出して DEK を復号
    const kek = yield* cryptoSvc.deriveKEK(config.serverSecret, googleSub)
    const dekBytes = yield* cryptoSvc.decryptDEK(kek, {
      ciphertext: existingUser.encrypted_dek,
      iv: existingUser.dek_iv,
    })
    const dekKey = yield* cryptoSvc.importDEK(dekBytes)

    // プロフィールを最新に更新
    yield* updateUserProfile(googleSub, {
      email: userInfo.email,
      display_name: userInfo.name,
      avatar_url: userInfo.picture ?? null,
    })

    // メインアカウントの refresh_token を更新（または再作成）
    let mainAccount = yield* findLinkedAccountByEmail(
      existingUser.id,
      userInfo.email,
    )

    const encryptedToken = yield* cryptoSvc.encrypt(
      dekKey,
      tokenData.refresh_token,
    )

    if (mainAccount) {
      // 既存のメインアカウントを更新
      yield* updateLinkedAccountToken(mainAccount.id, {
        encrypted_refresh_token: encryptedToken.ciphertext,
        refresh_token_iv: encryptedToken.iv,
        token_scope: tokenData.scope,
      })
      yield* updateLinkedAccountProfile(mainAccount.id, {
        display_name: userInfo.name,
        avatar_url: userInfo.picture ?? null,
      })
    } else {
      // linked_accounts 行が欠損している場合（手動DB操作等で消えた場合）に再作成。
      // ユーザー行は存在するがアカウント行がない不整合状態を修復する。
      const existingAccounts = yield* findLinkedAccountsByUserId(
        existingUser.id,
      )
      const colorIndex = existingAccounts.length % ACCOUNT_COLORS.length
      const newAccountId = crypto.randomUUID()

      yield* createLinkedAccount({
        id: newAccountId,
        user_id: existingUser.id,
        email: userInfo.email,
        google_sub: googleSub,
        display_name: userInfo.name,
        avatar_url: userInfo.picture ?? null,
        color: ACCOUNT_COLORS[colorIndex],
        encrypted_refresh_token: encryptedToken.ciphertext,
        refresh_token_iv: encryptedToken.iv,
        token_scope: tokenData.scope,
      })

      // 再作成したアカウントを後続処理で使えるようにする
      mainAccount = { id: newAccountId } as LinkedAccountRow
    }

    // セッションに保存（DEK の base64 文字列）
    // ...prev で既存セッション（他アカウントの accessTokenCache 等）を維持する
    const dekBase64 = uint8ToBase64(dekBytes)
    yield* session.update((prev) => ({
      ...prev,
      userId: existingUser.id,
      dek: dekBase64,
      codeVerifier: undefined,
      accessTokenCache: {
        ...prev.accessTokenCache,
        [mainAccount!.id]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }))
  })

/**
 * ケース3: ログイン済みユーザーがアカウント追加。
 * セッションから DEK を取得し、新しいアカウントの refresh_token を暗号化して
 * linked_accounts に追加する。
 */
const handleAddAccount = (
  userId: string,
  dekBase64: string,
  googleSub: string,
  userInfo: UserInfo,
  tokenData: VerifiedTokenData,
) =>
  Effect.gen(function* () {
    const session = yield* SessionService
    const cryptoSvc = yield* CryptoService

    const fromBase64 = (base64: string): Uint8Array => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }
    const dekBytes = fromBase64(dekBase64)
    const dekKey = yield* cryptoSvc.importDEK(dekBytes)

    // 同じメールアドレスが既に登録されているか確認
    const existing = yield* findLinkedAccountByEmail(userId, userInfo.email)

    if (existing) {
      // 再認証のケース: トークンとプロフィールを更新
      const encryptedToken = yield* cryptoSvc.encrypt(
        dekKey,
        tokenData.refresh_token,
      )
      yield* updateLinkedAccountToken(existing.id, {
        encrypted_refresh_token: encryptedToken.ciphertext,
        refresh_token_iv: encryptedToken.iv,
        token_scope: tokenData.scope,
      })
      yield* updateLinkedAccountProfile(existing.id, {
        display_name: userInfo.name,
        avatar_url: userInfo.picture ?? null,
      })

      // access_token をキャッシュに追加
      yield* session.update((prev) => ({
        ...prev,
        codeVerifier: undefined,
        accessTokenCache: {
          ...prev.accessTokenCache,
          [existing.id]: {
            accessToken: tokenData.access_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
          },
        },
      }))
    } else {
      // 新規アカウント追加
      const accountId = crypto.randomUUID()
      const encryptedToken = yield* cryptoSvc.encrypt(
        dekKey,
        tokenData.refresh_token,
      )

      // 既存アカウント数からカラーを決定
      const existingAccounts = yield* findLinkedAccountsByUserId(userId)
      const colorIndex = existingAccounts.length % ACCOUNT_COLORS.length

      yield* createLinkedAccount({
        id: accountId,
        user_id: userId,
        email: userInfo.email,
        google_sub: googleSub,
        display_name: userInfo.name,
        avatar_url: userInfo.picture ?? null,
        color: ACCOUNT_COLORS[colorIndex],
        encrypted_refresh_token: encryptedToken.ciphertext,
        refresh_token_iv: encryptedToken.iv,
        token_scope: tokenData.scope,
      })

      yield* session.update((prev) => ({
        ...prev,
        codeVerifier: undefined,
        accessTokenCache: {
          ...prev.accessTokenCache,
          [accountId]: {
            accessToken: tokenData.access_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
          },
        },
      }))
    }
  })

function redirectWithError(origin: string, error: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/?auth_error=${encodeURIComponent(error)}`,
    },
  })
}

export const Route = createFileRoute("/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const requestUrl = getRequestUrl()
        const origin = requestUrl.origin
        const env = await getEnv()

        // --- エラーケース ---
        const error = url.searchParams.get("error")
        if (error) {
          return redirectWithError(origin, error)
        }

        const code = url.searchParams.get("code")
        if (!code) {
          return redirectWithError(origin, "missing_authorization_code")
        }

        /**
         * OAuth コールバックの全ロジックを Effect で表現。
         * SessionService / CryptoService / D1Service / ConfigService に依存する。
         */
        const callbackEffect = Effect.gen(function* () {
          const session = yield* SessionService

          // セッションから code_verifier を取得
          const sessionData = yield* session.get()
          const codeVerifier = sessionData.codeVerifier
          if (!codeVerifier) {
            return redirectWithError(origin, "session_not_found")
          }

          // トークン交換
          const tokenData = yield* exchangeCode(code, codeVerifier, origin)

          // id_token から google_sub を取得
          const googleSub = yield* extractGoogleSub(tokenData.id_token)

          // ユーザー情報取得
          const userInfo = yield* fetchUserInfo(tokenData.access_token)

          // 3パターンの分岐
          const isAddAccountMode =
            !!sessionData.userId && !!sessionData.dek

          if (isAddAccountMode) {
            // ケース3: ログイン済みユーザーがアカウント追加
            yield* handleAddAccount(
              sessionData.userId!,
              sessionData.dek!,
              googleSub,
              userInfo,
              tokenData,
            )
          } else {
            // ケース1 or 2: 新規登録 or 既存ユーザーのログイン
            const existingUser = yield* findUserByGoogleSub(googleSub)

            if (existingUser) {
              yield* handleExistingUser(
                existingUser,
                googleSub,
                userInfo,
                tokenData,
              )
            } else {
              yield* handleNewUser(googleSub, userInfo, tokenData)
            }
          }

          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/` },
          })
        })

        return handleEffect(
          callbackEffect.pipe(
            Effect.catchAll((error) =>
              Effect.succeed(
                redirectWithError(
                  origin,
                  (error as { _tag?: string })._tag ?? "authentication_failed",
                ),
              ),
            ),
          ),
          env,
        )
      },
    },
  },
  component: () => (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <span className="text-4xl animate-spin">&#x23F3;</span>
      <p className="text-[var(--color-text-secondary)]">Authenticating...</p>
    </div>
  ),
})
