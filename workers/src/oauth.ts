/**
 * OAuth トークン交換・リフレッシュ。
 *
 * 背景: Google OAuth 2.0 の client_secret をサーバー側に保持し、
 * トークン交換とリフレッシュを仲介するプロキシ。
 * メール本文やユーザーデータには一切アクセスしない。
 */
import type { Env } from "./index";
import { corsHeaders } from "./index";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function handleOAuth(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsOrigin);
  }

  const url = new URL(request.url);

  switch (url.pathname) {
    case "/oauth/token":
      return tokenExchange(request, env, corsOrigin);
    case "/oauth/refresh":
      return tokenRefresh(request, env, corsOrigin);
    default:
      return json({ error: "Not found" }, 404, corsOrigin);
  }
}

/** 認可コード → トークン交換 */
async function tokenExchange(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  const body = await request.formData().catch(() => null);
  if (!body) return json({ error: "Invalid request body" }, 400, corsOrigin);

  const clientId = body.get("client_id");
  const code = body.get("code");
  const codeVerifier = body.get("code_verifier");
  const redirectUri = body.get("redirect_uri");

  if (!clientId || !code || !codeVerifier || !redirectUri) {
    return json({ error: "Missing required parameters" }, 400, corsOrigin);
  }

  const tokenBody = new URLSearchParams({
    client_id: clientId as string,
    client_secret: env.GOOGLE_CLIENT_SECRET,
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
  return json(data, response.status, corsOrigin);
}

/** リフレッシュトークン → 新しいアクセストークン */
async function tokenRefresh(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  const body = await request.formData().catch(() => null);
  if (!body) return json({ error: "Invalid request body" }, 400, corsOrigin);

  const clientId = body.get("client_id");
  const refreshToken = body.get("refresh_token");

  if (!clientId || !refreshToken) {
    return json({ error: "Missing required parameters" }, 400, corsOrigin);
  }

  const tokenBody = new URLSearchParams({
    client_id: clientId as string,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken as string,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  const data = await response.json();
  return json(data, response.status, corsOrigin);
}

function json(data: unknown, status: number, corsOrigin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(corsOrigin) },
  });
}
