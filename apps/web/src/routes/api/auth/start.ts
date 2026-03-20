/**
 * OAuth 認証開始 API（POST /api/auth/start）。
 *
 * 背景: PKCE code_verifier の生成と保管をサーバーサイドで行う。
 * code_verifier を暗号化セッションに保存し、クライアントには認可URLだけ返す。
 * これにより sessionStorage に秘密情報を置く必要がなくなる。
 *
 * フロー: クライアントがこのAPIを呼ぶ → PKCE生成 → セッションに保存 → 認可URL返却
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  getRequestUrl,
  updateSession,
} from "@tanstack/react-start/server";
import { createAuthorizationUrl } from "@vantagemail/core";
import { getSessionConfig, type AppSessionData } from "~/lib/session";

export const Route = createFileRoute("/api/auth/start")({
  server: {
    handlers: {
      POST: async () => {
        const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
          return Response.json(
            { error: "VITE_GOOGLE_CLIENT_ID is not configured" },
            { status: 500 },
          );
        }

        // リクエストURLからオリジンを取得してリダイレクトURIを構築
        const requestUrl = getRequestUrl();
        const redirectUri =
          process.env.VITE_OAUTH_REDIRECT_URI ??
          `${requestUrl.origin}/oauth/callback`;

        const { url, codeVerifier } = await createAuthorizationUrl({
          clientId,
          redirectUri,
        });

        // code_verifier を暗号化セッションに保存（コールバック時に使用）
        await updateSession<AppSessionData>(getSessionConfig(), (prev) => ({
          ...prev,
          codeVerifier,
        }));

        return Response.json({ url });
      },
    },
  },
});
