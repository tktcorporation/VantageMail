/**
 * OAuth トークンリフレッシュ API ルート（POST /api/oauth/refresh）。
 *
 * 背景: アクセストークンの有効期限切れ時に、リフレッシュトークンを使って
 * 新しいアクセストークンを取得する。client_secret はサーバー側で付与する。
 *
 * 移行元: workers/src/oauth.ts の tokenRefresh()
 */
import { createFileRoute } from "@tanstack/react-router";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const Route = createFileRoute("/api/oauth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientSecret) {
          return Response.json(
            { error: "GOOGLE_CLIENT_SECRET is not configured" },
            { status: 500 },
          );
        }

        const body = await request.formData().catch(() => null);
        if (!body) {
          return Response.json(
            { error: "Invalid request body" },
            { status: 400 },
          );
        }

        const clientId = body.get("client_id");
        const refreshToken = body.get("refresh_token");

        if (!clientId || !refreshToken) {
          return Response.json(
            { error: "Missing required parameters" },
            { status: 400 },
          );
        }

        const tokenBody = new URLSearchParams({
          client_id: clientId as string,
          client_secret: clientSecret,
          refresh_token: refreshToken as string,
          grant_type: "refresh_token",
        });

        const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        });

        const data = await response.json();
        return Response.json(data, { status: response.status });
      },
    },
  },
});
