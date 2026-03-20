/**
 * Push リレー — Gmail Pub/Sub → Durable Objects → WebSocket
 *
 * 背景: Gmail Pub/Sub の push subscription からの通知を受信し、
 * Durable Objects で管理する WebSocket 接続にファンアウトする。
 */
import type { Env } from "./index";

/** Pub/Sub push subscription からの通知を受信 */
export async function handlePush(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.json<{
      message: { data: string; messageId: string };
    }>();

    const decoded = atob(body.message.data);
    const notification = JSON.parse(decoded) as {
      emailAddress: string;
      historyId: string;
    };

    await env.SYNC_STATE.put(
      `history:${notification.emailAddress}`,
      notification.historyId,
    );

    const doId = env.PUSH_CONNECTIONS.idFromName(notification.emailAddress);
    const stub = env.PUSH_CONNECTIONS.get(doId);

    await stub.fetch(new Request("http://internal/notify", {
      method: "POST",
      body: JSON.stringify(notification),
    }));

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Push handling failed:", error);
    return new Response("Acknowledged with error", { status: 200 });
  }
}

/** WebSocket 接続を受け付けて Durable Object に転送 */
export async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accountEmail = url.searchParams.get("email");

  if (!accountEmail) {
    return new Response("Missing email parameter", { status: 400 });
  }

  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const doId = env.PUSH_CONNECTIONS.idFromName(accountEmail);
  const stub = env.PUSH_CONNECTIONS.get(doId);
  return stub.fetch(request);
}

/**
 * PushConnectionManager Durable Object
 *
 * 1 アカウントにつき 1 インスタンス。
 * 同じアカウントの複数デバイスからの WebSocket 接続を管理し、
 * 通知をファンアウトする。
 */
export class PushConnectionManager implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/notify") {
      return this.handleNotify(request);
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server);
    this.sessions.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleNotify(request: Request): Promise<Response> {
    const notification = await request.json();
    const message = JSON.stringify({ type: "gmail.sync", ...notification });

    for (const ws of this.sessions) {
      try { ws.send(message); } catch { this.sessions.delete(ws); }
    }
    return new Response("OK");
  }

  webSocketClose(ws: WebSocket) { this.sessions.delete(ws); }
  webSocketError(ws: WebSocket) { this.sessions.delete(ws); }
}
