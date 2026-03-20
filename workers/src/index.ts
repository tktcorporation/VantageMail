/**
 * VantageMail バックグラウンド Worker エントリーポイント。
 *
 * 背景: Push 通知受信・WebSocket・スケジュール処理など、
 * SSR とは独立したバックグラウンド機能を提供する。
 *
 * OAuth トークン交換・リフレッシュは apps/web の TanStack Start サーバールート
 * （/api/oauth/*）に移行済み。同一 Worker 内で処理するため CORS 問題が構造的に解消。
 *
 * ルーティング:
 *   /push      → Gmail Pub/Sub 通知受信（push.ts）
 *   /ws        → WebSocket 接続（push.ts）
 *   /schedule  → スヌーズ・送信予約（scheduler.ts）
 */
import { handlePush, handleWebSocket, PushConnectionManager } from "./push";
import { handleSchedule, processScheduledJobs, reregisterGmailWatch } from "./scheduler";

// DO は wrangler.toml で有効化されている場合のみエクスポートされる
export { PushConnectionManager };

export interface Env {
  ALLOWED_ORIGINS: string;
  // 以下は段階的に有効化（wrangler.toml のコメント解除に対応）
  PUSH_CONNECTIONS?: DurableObjectNamespace;
  SYNC_STATE?: KVNamespace;
  SCHEDULED_JOBS?: KVNamespace;
  WATCH_STATE?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    // CORS
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    // ルーティング
    if (url.pathname === "/push") {
      return handlePush(request, env);
    }
    if (url.pathname === "/ws") {
      return handleWebSocket(request, env);
    }
    if (url.pathname === "/schedule") {
      return handleSchedule(request, env);
    }

    // Static Assets がマッチしなかった場合（SPA フォールバック等）
    return new Response("Not found", { status: 404 });
  },

  /**
   * Cron Trigger ハンドラ。
   * 毎分: スヌーズ・送信予約のジョブ処理
   * 6日ごと: Gmail watch() の再登録
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 毎分のジョブ処理
    ctx.waitUntil(processScheduledJobs(env, ctx));
    // 6日ごとの watch 再登録（Cron の分離はイベント内で判定）
    ctx.waitUntil(reregisterGmailWatch(env));
  },
} satisfies ExportedHandler<Env>;

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Upgrade",
    "Access-Control-Max-Age": "86400",
  };
}
