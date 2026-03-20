/**
 * OAuth プロキシ Cloudflare Worker。
 *
 * 背景: Google OAuth 2.0 のトークン交換にはclient_secretが必要だが、
 * パブリッククライアント（Web/デスクトップアプリ）にはsecretを埋め込めない。
 * このWorkerがプロキシとしてsecretを保持し、トークン交換とリフレッシュを仲介する。
 * メール本文やユーザーデータには一切アクセスしない（spec §6.4）。
 *
 * エンドポイント:
 * - POST /oauth/token  — 認可コードをトークンに交換
 * - POST /oauth/refresh — リフレッシュトークンでアクセストークンを更新
 *
 * Cron (6日ごと):
 * - Gmail watch() の再登録（7日で期限切れのため）
 */

interface Env {
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_ORIGINS: string;
  WATCH_STATE: KVNamespace;
}

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    // CORS: 許可されたオリジンのみ応答
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "";

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(corsOrigin),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsOrigin);
    }

    try {
      switch (url.pathname) {
        case "/oauth/token":
          return await handleTokenExchange(request, env, corsOrigin);
        case "/oauth/refresh":
          return await handleTokenRefresh(request, env, corsOrigin);
        default:
          return jsonResponse({ error: "Not found" }, 404, corsOrigin);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse({ error: message }, 500, corsOrigin);
    }
  },
  /**
   * Cron Trigger: Gmail watch() の再登録。
   *
   * 背景: Gmail の users.watch() は7日で期限切れになる。
   * 6日ごとに Cron で再登録することで、プッシュ通知を継続する。
   * KV に保存された各アカウントのリフレッシュトークンを使い、
   * アクセストークンを取得して watch() を呼ぶ。
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const accounts = await env.WATCH_STATE.list({ prefix: "watch:" });

    for (const key of accounts.keys) {
      ctx.waitUntil(reregisterWatch(key.name, env));
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * Gmail watch() を再登録する。
 * KV から保存されたアカウント情報を読み、トークンリフレッシュ → watch() を実行。
 */
async function reregisterWatch(kvKey: string, env: Env): Promise<void> {
  const data = await env.WATCH_STATE.get(kvKey);
  if (!data) return;

  const account = JSON.parse(data) as {
    clientId: string;
    refreshToken: string;
    pubsubTopic: string;
  };

  // トークンをリフレッシュ
  const tokenBody = new URLSearchParams({
    client_id: account.clientId,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    console.error(`Token refresh failed for ${kvKey}: ${tokenRes.status}`);
    return;
  }

  const tokens = await tokenRes.json<{ access_token: string }>();

  // Gmail watch() を再登録
  const watchRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/watch",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: account.pubsubTopic,
        labelIds: ["INBOX"],
      }),
    },
  );

  if (!watchRes.ok) {
    console.error(`Watch re-registration failed for ${kvKey}: ${watchRes.status}`);
  }
}

/**
 * 認可コード → トークン交換。
 * クライアントからclient_id, code, code_verifier, redirect_uriを受け取り、
 * client_secretを付加してGoogleに転送する。
 */
async function handleTokenExchange(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  const body = await request.formData().catch(() => null);
  if (!body) {
    return jsonResponse({ error: "Invalid request body" }, 400, corsOrigin);
  }

  const clientId = body.get("client_id");
  const code = body.get("code");
  const codeVerifier = body.get("code_verifier");
  const redirectUri = body.get("redirect_uri");

  if (!clientId || !code || !codeVerifier || !redirectUri) {
    return jsonResponse(
      { error: "Missing required parameters: client_id, code, code_verifier, redirect_uri" },
      400,
      corsOrigin,
    );
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
  return jsonResponse(data, response.status, corsOrigin);
}

/**
 * リフレッシュトークン → 新しいアクセストークン。
 * クライアントからclient_id, refresh_tokenを受け取り、
 * client_secretを付加してGoogleに転送する。
 */
async function handleTokenRefresh(
  request: Request,
  env: Env,
  corsOrigin: string,
): Promise<Response> {
  const body = await request.formData().catch(() => null);
  if (!body) {
    return jsonResponse({ error: "Invalid request body" }, 400, corsOrigin);
  }

  const clientId = body.get("client_id");
  const refreshToken = body.get("refresh_token");

  if (!clientId || !refreshToken) {
    return jsonResponse(
      { error: "Missing required parameters: client_id, refresh_token" },
      400,
      corsOrigin,
    );
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
  return jsonResponse(data, response.status, corsOrigin);
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status: number, corsOrigin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(corsOrigin),
    },
  });
}
