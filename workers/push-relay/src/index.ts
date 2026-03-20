/**
 * Push Relay Worker — Gmail Pub/Sub → Durable Objects → WebSocket
 *
 * 背景: Gmail の users.watch() は GCP Pub/Sub にしか通知を送れない。
 * Pub/Sub の push subscription 先をこの Worker にし、ここから先は全て
 * Cloudflare 内で完結させる。GCP 依存を Pub/Sub トピック1個に最小化。
 *
 * データフロー:
 * [Gmail] → [GCP Pub/Sub] → POST /push → [この Worker] → [Durable Object] → [WebSocket] → [クライアント]
 *
 * エンドポイント:
 * - POST /push          — Pub/Sub push subscription からの通知受信
 * - GET  /ws?accountId= — クライアントが WebSocket 接続を開始
 * - POST /watch         — Gmail watch() の登録（クライアントから呼ばれる）
 */

interface Env {
  PUSH_CONNECTIONS: DurableObjectNamespace;
  SYNC_STATE: KVNamespace;
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/push":
        return handlePubSubPush(request, env);
      case "/ws":
        return handleWebSocket(request, env);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * GCP Pub/Sub push subscription からの通知を受信する。
 *
 * 背景: Pub/Sub は以下の形式で POST してくる:
 * {
 *   "message": {
 *     "data": "<base64エンコードされたJSON>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * data をデコードすると Gmail の通知ペイロード:
 * { "emailAddress": "user@gmail.com", "historyId": "12345" }
 */
async function handlePubSubPush(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.json<{
      message: { data: string; messageId: string };
    }>();

    // Pub/Sub メッセージの data は base64 エンコード
    const decoded = atob(body.message.data);
    const notification = JSON.parse(decoded) as {
      emailAddress: string;
      historyId: string;
    };

    // KV に最新の historyId を保存（インクリメンタル同期の起点）
    await env.SYNC_STATE.put(
      `history:${notification.emailAddress}`,
      notification.historyId,
    );

    // Durable Object に通知を転送 → WebSocket でクライアントにファンアウト
    // emailAddress をキーにして、同じアカウントの接続を1つの DO にまとめる
    const doId = env.PUSH_CONNECTIONS.idFromName(notification.emailAddress);
    const stub = env.PUSH_CONNECTIONS.get(doId);

    await stub.fetch(new Request("http://internal/notify", {
      method: "POST",
      body: JSON.stringify(notification),
    }));

    // Pub/Sub は 200 を返さないと再送する
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Push notification handling failed:", error);
    // 500 を返すと Pub/Sub が再送するので、パースエラーの場合は 200 で消化
    return new Response("Acknowledged with error", { status: 200 });
  }
}

/**
 * クライアントからの WebSocket 接続を受け付ける。
 *
 * 背景: クライアントは認証後にこのエンドポイントに WebSocket 接続し、
 * Gmail の変更通知をリアルタイムで受け取る。アカウントごとに
 * Durable Object を分けることで、関係ない通知が届かないようにする。
 */
async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accountEmail = url.searchParams.get("email");

  if (!accountEmail) {
    return new Response("Missing email parameter", { status: 400 });
  }

  // Upgrade ヘッダーの確認
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // 対応する Durable Object に転送
  const doId = env.PUSH_CONNECTIONS.idFromName(accountEmail);
  const stub = env.PUSH_CONNECTIONS.get(doId);
  return stub.fetch(request);
}

/**
 * PushConnectionManager Durable Object
 *
 * 背景: 1つのメールアカウントにつき1つの DO インスタンスが存在する。
 * 同じアカウントで複数デバイス（Web + デスクトップ）から接続している場合、
 * この DO が全ての WebSocket 接続を管理し、通知をファンアウトする。
 *
 * ライフサイクル: WebSocket 接続がある間アクティブ。
 * 全接続が切れると CF が自動的にインスタンスを回収する。
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

    // WebSocket ハンドシェイク
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * 新しい WebSocket 接続を受け付ける。
   * CF Durable Objects の WebSocket Hibernation API を使用し、
   * アイドル時のメモリ消費を最小化する。
   */
  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Pub/Sub からの通知を全接続クライアントにブロードキャストする。
   */
  private async handleNotify(request: Request): Promise<Response> {
    const notification = await request.json();
    const message = JSON.stringify({
      type: "gmail.sync",
      ...notification,
    });

    // 切断されたセッションを除去しながらブロードキャスト
    for (const ws of this.sessions) {
      try {
        ws.send(message);
      } catch {
        this.sessions.delete(ws);
      }
    }

    return new Response("OK");
  }

  /**
   * WebSocket Hibernation API のコールバック。
   * 接続切断時にセッションをクリーンアップする。
   */
  webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
  }
}
