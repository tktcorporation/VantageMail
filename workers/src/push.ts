/**
 * Push リレー — Gmail Pub/Sub → Durable Objects → WebSocket
 *
 * 背景: Gmail Pub/Sub の push subscription からの通知を受信し、
 * Durable Objects で管理する WebSocket 接続にファンアウトする。
 *
 * CRITICAL: Pub/Sub は HTTP 200 を受け取らないと再送を繰り返すため、
 * エラー発生時も必ず 200 を返す（Effect.catchAll で保証）。
 */
import { Effect } from "effect";
import type { Env } from "./index";

/** Pub/Sub 通知のデコード済みペイロード */
interface PubSubNotification {
  readonly emailAddress: string;
  readonly historyId: string;
}

/**
 * Cloudflare Workers の WebSocket.readyState 定数。
 *
 * 背景: DOM の WebSocket 型が Workers ランタイムでは型定義されていないため、
 * DOM 標準で定義された数値 (OPEN = 1) を定数化する。
 * 参照: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
 */
const WS_READY_STATE_OPEN = 1;

/**
 * Pub/Sub push body をデコードし、KV に historyId を保存、
 * Durable Object 経由で WebSocket にファンアウトする Effect プログラム。
 *
 * 呼び出し元: handlePush()
 * 失敗条件: JSON パース失敗、KV 書き込み失敗、DO フェッチ失敗
 */
const processPushNotification = (
  request: Request,
  env: Env,
): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json<{ message: { data: string; messageId: string } }>(),
      catch: (e) => new Error(`Failed to parse request body: ${e}`),
    });

    const decoded = atob(body.message.data);
    const notification = JSON.parse(decoded) as PubSubNotification;

    // historyId を KV に保存（差分同期の起点として使用）
    yield* Effect.tryPromise({
      try: () =>
        env.SYNC_STATE!.put(`history:${notification.emailAddress}`, notification.historyId),
      catch: (e) => new Error(`KV put failed: ${e}`),
    });

    // Durable Object に通知をファンアウト
    const doId = env.PUSH_CONNECTIONS!.idFromName(notification.emailAddress);
    const stub = env.PUSH_CONNECTIONS!.get(doId);

    yield* Effect.tryPromise({
      try: () =>
        stub.fetch(
          new Request("http://internal/notify", {
            method: "POST",
            body: JSON.stringify(notification),
          }),
        ),
      catch: (e) => new Error(`DO fetch failed: ${e}`),
    });

    return new Response("OK", { status: 200 });
  }).pipe(
    // Pub/Sub は 200 以外を受け取ると再送するため、エラー時も必ず 200 を返す
    Effect.catchAll((error) =>
      Effect.succeed(
        (() => {
          console.error("Push handling failed:", error);
          return new Response("Acknowledged with error", { status: 200 });
        })(),
      ),
    ),
  );

/** Pub/Sub push subscription からの通知を受信 */
export async function handlePush(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  return Effect.runPromise(processPushNotification(request, env));
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

  const doId = env.PUSH_CONNECTIONS!.idFromName(accountEmail);
  const stub = env.PUSH_CONNECTIONS!.get(doId);
  return stub.fetch(request);
}

/**
 * PushConnectionManager Durable Object
 *
 * 1 アカウントにつき 1 インスタンス。
 * 同じアカウントの複数デバイスからの WebSocket 接続を管理し、
 * 通知をファンアウトする。
 *
 * Durable Object は Cloudflare ランタイムが管理するため Effect 化しない。
 * fetch() 内部の処理は十分シンプルで、try-catch で十分。
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
    const notification = (await request.json()) as Record<string, unknown>;
    const message = JSON.stringify({ type: "gmail.sync", ...notification });

    // readyState === 1 (OPEN) 以外の WebSocket は送信できず、
    // send() が例外を投げる可能性があるため事前にフィルタして掃除する。
    // CLOSING / CLOSED の WebSocket はセッションから除外する。
    for (const ws of this.sessions) {
      if (ws.readyState !== WS_READY_STATE_OPEN) {
        this.sessions.delete(ws);
        continue;
      }
      ws.send(message);
    }
    return new Response("OK");
  }

  webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
  }
  webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
  }
}
