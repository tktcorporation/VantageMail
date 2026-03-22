/**
 * Server-side Gmail API helper（Effect 版）。
 *
 * 背景: D1 に暗号化保存された refresh_token を復号し、
 * access_token を取得して Gmail API にアクセスする。
 * access_token はセッションにキャッシュし、有効期限5分前に自動リフレッシュする。
 * トークンはサーバー側でのみ使用し、クライアントに露出しない。
 *
 * 全操作を Effect で表現し、SessionService / CryptoService / D1Service への
 * 依存を型レベルで追跡する。
 */
import { Effect } from "effect";
import {
  NotAuthenticated,
  GmailApiError,
  type TokenExchangeError,
  type DecryptionError,
  type EncryptionError,
  type KeyDerivationError,
  type DbQueryError,
  type SessionError,
} from "@vantagemail/core";
import { SessionService } from "./services/SessionService.ts";
import { CryptoService } from "./services/CryptoService.ts";
import { ConfigService } from "./services/ConfigService.ts";
import { GOOGLE_CLIENT_ID } from "./constants.ts";
import { findLinkedAccountsByUserId, updateLinkedAccountToken } from "./db.ts";
import type { LinkedAccountRow } from "./db.ts";
import type { AppServices } from "./runtime.ts";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface RefreshResult {
  accessToken: string;
  expiresAt: number;
  scope: string;
  /** Google がローテーションした場合のみ値が入る */
  newRefreshToken?: string;
}

/**
 * Google Token Endpoint で access_token をリフレッシュする。
 * ConfigService から clientSecret を取得し、constants.ts から clientId を取得する。
 */
const refreshGoogleToken = (
  refreshToken: string,
): Effect.Effect<RefreshResult, GmailApiError, ConfigService> =>
  Effect.gen(function* () {
    const config = yield* ConfigService;
    const clientId = GOOGLE_CLIENT_ID;
    const clientSecret = config.googleClientSecret;
    if (!clientId || !clientSecret) {
      return yield* Effect.fail(
        new GmailApiError({
          status: 0,
          path: GOOGLE_TOKEN_ENDPOINT,
          body: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET",
        }),
      );
    }

    return yield* Effect.tryPromise({
      try: async () => {
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        });

        const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Token refresh failed: ${response.status} ${errText}`);
        }

        const data = (await response.json()) as {
          access_token: string;
          expires_in: number;
          scope: string;
          refresh_token?: string;
        };
        return {
          accessToken: data.access_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          scope: data.scope,
          // Google はトークンローテーション時のみ新しい refresh_token を返す
          newRefreshToken: data.refresh_token ?? undefined,
        };
      },
      catch: (e) =>
        new GmailApiError({
          status: 0,
          path: GOOGLE_TOKEN_ENDPOINT,
          body: String(e),
        }),
    });
  });

/**
 * 指定アカウントの有効な access_token を取得する Effect。
 *
 * 1. セッションのキャッシュを確認（有効期限5分以上）
 * 2. キャッシュなし/期限切れ → D1 から暗号化 refresh_token を取得
 * 3. DEK で復号 → Google Token Endpoint でリフレッシュ
 * 4. 新しい access_token をセッションにキャッシュ
 * 5. Google が新しい refresh_token を返した場合は D1 を更新
 *
 * 依存: SessionService, CryptoService, D1Service
 */
export const getAccessToken = (
  accountId: string,
): Effect.Effect<
  string,
  | NotAuthenticated
  | SessionError
  | DbQueryError
  | DecryptionError
  | EncryptionError
  | KeyDerivationError
  | GmailApiError,
  AppServices
> =>
  Effect.gen(function* () {
    const session = yield* SessionService;
    const cryptoSvc = yield* CryptoService;

    // 認証チェック
    const auth = yield* session.requireAuth();

    // 1. セッションキャッシュを確認
    const sessionData = yield* session.get();
    const cached = sessionData.accessTokenCache?.[accountId];
    if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
      return cached.accessToken;
    }

    // 2. D1 からアカウント情報を取得
    const accounts = yield* findLinkedAccountsByUserId(auth.userId);
    const account = accounts.find((a: LinkedAccountRow) => a.id === accountId);
    if (!account) {
      return yield* Effect.fail(
        new GmailApiError({
          status: 404,
          path: `/accounts/${accountId}`,
          body: "Account not found",
        }),
      );
    }

    // 3. DEK で refresh_token を復号
    const fromBase64 = (base64: string): Uint8Array => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    };
    const dekBytes = fromBase64(auth.dek);
    const dekKey = yield* cryptoSvc.importDEK(dekBytes);
    const refreshToken = yield* cryptoSvc.decrypt(dekKey, {
      ciphertext: account.encrypted_refresh_token,
      iv: account.refresh_token_iv,
    });

    // 4. access_token をリフレッシュ
    const refreshed = yield* refreshGoogleToken(refreshToken);

    // 5. セッションにキャッシュ
    yield* session.update((prev) => ({
      ...prev,
      accessTokenCache: {
        ...prev.accessTokenCache,
        [accountId]: {
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
        },
      },
    }));

    // 6. Google が新しい refresh_token を返した場合は D1 を更新
    if (refreshed.newRefreshToken) {
      const encrypted = yield* cryptoSvc.encrypt(dekKey, refreshed.newRefreshToken);
      yield* updateLinkedAccountToken(
        accountId,
        {
          encrypted_refresh_token: encrypted.ciphertext,
          refresh_token_iv: encrypted.iv,
          token_scope: refreshed.scope,
        },
        auth.userId,
      );
    }

    return refreshed.accessToken;
  });

/**
 * Gmail API に認証付きリクエストを送る Effect。
 *
 * access_token を取得してから Gmail API を呼び出し、
 * レスポンスを JSON パースして返す。
 */
export const gmailFetch = <T>(
  accountId: string,
  path: string,
): Effect.Effect<
  T | null,
  | NotAuthenticated
  | SessionError
  | DbQueryError
  | DecryptionError
  | EncryptionError
  | KeyDerivationError
  | GmailApiError,
  AppServices
> =>
  Effect.gen(function* () {
    const accessToken = yield* getAccessToken(accountId);

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${GMAIL_API_BASE}${path}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }),
      catch: (e) =>
        new GmailApiError({
          status: 0,
          path,
          body: String(e),
        }),
    });

    if (!response.ok) {
      console.error(`Gmail API error ${response.status} on ${path}`);
      return null;
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: (e) =>
        new GmailApiError({
          status: response.status,
          path,
          body: `JSON parse error: ${String(e)}`,
        }),
    });
  });
