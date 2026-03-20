/**
 * OAuth コールバックルート（GET /oauth/callback）。
 *
 * 背景: Google OAuth 認証後のリダイレクト先。サーバーサイドで全処理を行う。
 * 1. セッションから PKCE code_verifier を取得
 * 2. Google に直接トークン交換（client_secret はサーバー上にあるためプロキシ不要）
 * 3. ユーザー情報を取得
 * 4. アカウント＋トークンを暗号化セッションに保存
 * 5. / にリダイレクト
 *
 * トークンはサーバー側の暗号化Cookieに格納され、クライアントJSに露出しない。
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  getRequestUrl,
  getSession,
  updateSession,
} from "@tanstack/react-start/server";
import type { Account, OAuthTokens } from "@vantagemail/core";
import {
  getSessionConfig,
  type AppSessionData,
  type StoredAccount,
} from "~/lib/session";

/** アカウントに割り当てるカラーのプール */
const ACCOUNT_COLORS = [
  "#228be6", "#40c057", "#fab005", "#fa5252",
  "#7950f2", "#e64980", "#15aabf", "#fd7e14",
];

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

export const Route = createFileRoute("/oauth/callback")({
  server: {
    handlers: {
      /**
       * Google からのリダイレクトを処理する。
       * 全処理がサーバーサイドで完結し、成功/失敗に関わらず / にリダイレクトする。
       */
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const requestUrl = getRequestUrl();
        const origin = requestUrl.origin;

        // --- エラーケース ---
        const error = url.searchParams.get("error");
        if (error) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${origin}/?auth_error=${encodeURIComponent(error)}`,
            },
          });
        }

        const code = url.searchParams.get("code");
        if (!code) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${origin}/?auth_error=${encodeURIComponent("missing_authorization_code")}`,
            },
          });
        }

        // --- セッションから code_verifier を取得 ---
        const session = await getSession<AppSessionData>(getSessionConfig());
        const codeVerifier = session.data.codeVerifier;
        if (!codeVerifier) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${origin}/?auth_error=${encodeURIComponent("session_not_found")}`,
            },
          });
        }

        try {
          // --- トークン交換（サーバーから直接 Google に送信） ---
          // VITE_ vars: build-time inline. GOOGLE_CLIENT_SECRET: Worker runtime secret.
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID!;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
          const redirectUri =
            import.meta.env.VITE_OAUTH_REDIRECT_URI ??
            `${origin}/oauth/callback`;

          const tokenBody = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: codeVerifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          });

          const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tokenBody.toString(),
          });

          if (!tokenResponse.ok) {
            // Log the full error server-side, but don't leak details to the client
            const errText = await tokenResponse.text();
            console.error("Token exchange failed:", tokenResponse.status, errText);
            throw new Error("token_exchange_failed");
          }

          const tokenData = await tokenResponse.json();

          // refresh_token is required for long-lived access.
          // Google returns it only when prompt=consent (which we always set),
          // but guard against future changes or unexpected responses.
          if (!tokenData.refresh_token) {
            throw new Error("refresh_token_missing");
          }

          const tokens: OAuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scope,
          };

          // --- ユーザー情報取得 ---
          const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });

          if (!userInfoResponse.ok) {
            console.error("Failed to fetch user info:", userInfoResponse.status);
            throw new Error("userinfo_fetch_failed");
          }

          const userInfo = await userInfoResponse.json();

          // --- セッションにアカウント＋トークンを保存 ---
          await updateSession<AppSessionData>(getSessionConfig(), (prev) => {
            const existingAccounts = prev.accounts ?? [];

            // 同じメールアドレスのアカウントが既にあれば上書き（再認証のケース）
            const existingIdx = existingAccounts.findIndex(
              (sa: StoredAccount) => sa.account.email === userInfo.email,
            );

            const account: Account = {
              id: existingIdx >= 0
                ? existingAccounts[existingIdx].account.id
                : crypto.randomUUID(),
              email: userInfo.email,
              displayName: userInfo.name,
              avatarUrl: userInfo.picture,
              color: existingIdx >= 0
                ? existingAccounts[existingIdx].account.color
                : ACCOUNT_COLORS[existingAccounts.length % ACCOUNT_COLORS.length],
              unreadCount: 0,
              notificationsEnabled: true,
            };

            const stored: StoredAccount = { account, tokens };

            const newAccounts = [...existingAccounts];
            if (existingIdx >= 0) {
              newAccounts[existingIdx] = stored;
            } else {
              newAccounts.push(stored);
            }

            return {
              accounts: newAccounts,
              // code_verifier を削除（使用済み）
              codeVerifier: undefined,
            };
          });

          // --- 成功: メイン画面にリダイレクト ---
          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/` },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "authentication_failed";
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${origin}/?auth_error=${encodeURIComponent(message)}`,
            },
          });
        }
      },
    },
  },
  // Server handler always redirects, so this component is only a fallback
  component: () => (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <span className="text-4xl animate-spin">⏳</span>
      <p className="text-[var(--color-text-secondary)]">Authenticating...</p>
    </div>
  ),
});
