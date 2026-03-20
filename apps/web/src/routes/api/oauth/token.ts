/**
 * OAuth トークン交換 API ルート（POST /api/oauth/token）。
 *
 * 背景: Google OAuth 2.0 の client_secret をサーバー側に保持し、
 * クライアントからの認可コードを安全にトークンに交換するプロキシ。
 * TanStack Start のサーバールートとして同一 Worker 内で動作するため、
 * CORS や別プロセス起動が不要。
 *
 * 移行元: workers/src/oauth.ts の tokenExchange()
 */
import { createFileRoute } from "@tanstack/react-router";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const Route = createFileRoute("/api/oauth/token")({
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
        const code = body.get("code");
        const codeVerifier = body.get("code_verifier");
        const redirectUri = body.get("redirect_uri");

        if (!clientId || !code || !codeVerifier || !redirectUri) {
          return Response.json(
            { error: "Missing required parameters" },
            { status: 400 },
          );
        }

        const tokenBody = new URLSearchParams({
          client_id: clientId as string,
          client_secret: clientSecret,
          code: code as string,
          code_verifier: codeVerifier as string,
          grant_type: "authorization_code",
          redirect_uri: redirectUri as string,
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
