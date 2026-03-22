/**
 * スケジューラー — スヌーズ/送信予約 + Gmail watch 再登録
 *
 * 背景: Cron Triggers で毎分ジョブチェック、6日ごとに watch 再登録。
 * KV からジョブを読み出し、期限到来分を Durable Object 経由で WebSocket に通知する。
 */
import { Effect } from "effect";
import type { Env } from "./index";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface ScheduledJob {
  id: string;
  type: "snooze" | "send_later";
  executeAt: number;
  accountEmail: string;
  threadId?: string;
  rawMessage?: string;
  createdAt: number;
}

// ─── HTTP ハンドラ（/schedule） ───

export async function handleSchedule(request: Request, env: Env): Promise<Response> {
  switch (request.method) {
    case "POST":
      return Effect.runPromise(createJob(request, env));
    case "DELETE":
      return Effect.runPromise(cancelJob(request, env));
    case "GET":
      return Effect.runPromise(listJobs(request, env));
    default:
      return new Response("Method not allowed", { status: 405 });
  }
}

/**
 * ジョブを KV に作成し、アカウントごとのインデックスを更新する。
 *
 * KV キー設計:
 *   job:{executeAt}:{id} — ジョブ本体（Cron で prefix scan するため executeAt を含む）
 *   idx:{email}          — アカウントごとのジョブキー一覧（listJobs 用）
 */
const createJob = (request: Request, env: Env): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () =>
        request.json<{
          type: "snooze" | "send_later";
          executeAt: number;
          accountEmail: string;
          threadId?: string;
          rawMessage?: string;
        }>(),
      catch: (e) => new Error(`Invalid request body: ${e}`),
    });

    if (!body.type || !body.executeAt || !body.accountEmail) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const job: ScheduledJob = { id, ...body, createdAt: Date.now() };
    const key = `job:${body.executeAt}:${id}`;

    yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.put(key, JSON.stringify(job)),
      catch: (e) => new Error(`KV put job failed: ${e}`),
    });

    // アカウントごとのインデックスを更新
    const idxKey = `idx:${body.accountEmail}`;
    const existing = yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.get(idxKey),
      catch: (e) => new Error(`KV get index failed: ${e}`),
    });
    const jobIds: string[] = existing ? JSON.parse(existing) : [];
    jobIds.push(key);

    yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.put(idxKey, JSON.stringify(jobIds)),
      catch: (e) => new Error(`KV put index failed: ${e}`),
    });

    return Response.json({ id, key }, { status: 201 });
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        Response.json({ error: `Internal error: ${(error as Error).message}` }, { status: 500 }),
      ),
    ),
  );

/**
 * ジョブを KV から削除し、アカウントインデックスからも除去する。
 */
const cancelJob = (request: Request, env: Env): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const body = yield* Effect.tryPromise({
      try: () => request.json<{ key: string; accountEmail: string }>(),
      catch: (e) => new Error(`Invalid request body: ${e}`),
    });

    if (!body.key) {
      return Response.json({ error: "Missing key" }, { status: 400 });
    }

    yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.delete(body.key),
      catch: (e) => new Error(`KV delete failed: ${e}`),
    });

    if (body.accountEmail) {
      const idxKey = `idx:${body.accountEmail}`;
      const existing = yield* Effect.tryPromise({
        try: () => env.SCHEDULED_JOBS!.get(idxKey),
        catch: (e) => new Error(`KV get index failed: ${e}`),
      });
      if (existing) {
        const jobIds: string[] = JSON.parse(existing);
        yield* Effect.tryPromise({
          try: () =>
            env.SCHEDULED_JOBS!.put(idxKey, JSON.stringify(jobIds.filter((k) => k !== body.key))),
          catch: (e) => new Error(`KV put index failed: ${e}`),
        });
      }
    }

    return Response.json({ ok: true });
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        Response.json({ error: `Internal error: ${(error as Error).message}` }, { status: 500 }),
      ),
    ),
  );

/**
 * 指定アカウントのジョブ一覧を返す。
 * idx:{email} からキー一覧を取得し、各ジョブ本体を KV から読み出す。
 */
const listJobs = (request: Request, env: Env): Effect.Effect<Response, never, never> =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    if (!email) {
      return Response.json({ error: "Missing email" }, { status: 400 });
    }

    const existing = yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.get(`idx:${email}`),
      catch: (e) => new Error(`KV get index failed: ${e}`),
    });
    const jobKeys: string[] = existing ? JSON.parse(existing) : [];

    const jobs: ScheduledJob[] = [];
    for (const key of jobKeys) {
      const data = yield* Effect.tryPromise({
        try: () => env.SCHEDULED_JOBS!.get(key),
        catch: (e) => new Error(`KV get job failed: ${e}`),
      });
      if (data) jobs.push(JSON.parse(data));
    }

    return Response.json({ jobs });
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        Response.json({ error: `Internal error: ${(error as Error).message}` }, { status: 500 }),
      ),
    ),
  );

// ─── Cron ハンドラ ───

/**
 * 毎分: 期限が来たジョブを処理する。
 *
 * KV の prefix scan で job: キーを列挙し、executeAt が現在時刻を過ぎたものを
 * Durable Object に通知してから削除する。
 */
export async function processScheduledJobs(env: Env, ctx: ExecutionContext): Promise<void> {
  const program = Effect.gen(function* () {
    const now = Date.now();
    const jobKeys = yield* Effect.tryPromise({
      try: () => env.SCHEDULED_JOBS!.list({ prefix: "job:" }),
      catch: (e) => new Error(`KV list failed: ${e}`),
    });

    for (const key of jobKeys.keys) {
      const parts = key.name.split(":");
      const executeAt = Number(parts[1]);
      if (executeAt > now) continue;

      const jobData = yield* Effect.tryPromise({
        try: () => env.SCHEDULED_JOBS!.get(key.name),
        catch: (e) => new Error(`KV get failed: ${e}`),
      });
      if (!jobData) continue;

      const job = JSON.parse(jobData) as ScheduledJob;
      // waitUntil で非同期実行し、完了後にジョブを削除
      ctx.waitUntil(
        Effect.runPromise(processJob(job, env)).finally(() => env.SCHEDULED_JOBS!.delete(key.name)),
      );
    }
  }).pipe(
    Effect.catchAll((error) => {
      console.error("processScheduledJobs failed:", error);
      return Effect.void;
    }),
  );

  await Effect.runPromise(program);
}

/**
 * 個別ジョブを処理する。
 * Durable Object 経由で WebSocket クライアントに通知を送る。
 */
const processJob = (job: ScheduledJob, env: Env): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const doId = env.PUSH_CONNECTIONS!.idFromName(job.accountEmail);
    const stub = env.PUSH_CONNECTIONS!.get(doId);

    yield* Effect.tryPromise({
      try: () =>
        stub.fetch(
          new Request("http://internal/notify", {
            method: "POST",
            body: JSON.stringify({
              emailAddress: job.accountEmail,
              type: job.type === "snooze" ? "snooze_restore" : "send_scheduled",
              threadId: job.threadId,
              rawMessage: job.rawMessage,
            }),
          }),
        ),
      catch: (e) => new Error(`DO notification failed: ${e}`),
    });
  }).pipe(
    Effect.catchAll((error) => {
      console.error(`Job ${job.id} failed:`, error);
      return Effect.void;
    }),
  );

/**
 * 6日ごと: Gmail watch() の再登録。
 *
 * 背景: Gmail watch() は7日で期限切れになるため、6日ごとに再登録する。
 * refresh_token でアクセストークンを取得し、watch API を呼ぶ。
 */
export async function reregisterGmailWatch(env: Env): Promise<void> {
  const program = Effect.gen(function* () {
    const accounts = yield* Effect.tryPromise({
      try: () => env.WATCH_STATE!.list({ prefix: "watch:" }),
      catch: (e) => new Error(`KV list failed: ${e}`),
    });

    for (const key of accounts.keys) {
      // 各アカウントのエラーは個別にログして続行
      yield* Effect.tryPromise({
        try: async () => {
          const data = await env.WATCH_STATE!.get(key.name);
          if (!data) return;

          const account = JSON.parse(data) as {
            clientId: string;
            refreshToken: string;
            pubsubTopic: string;
          };

          const tokenBody = new URLSearchParams({
            client_id: account.clientId,
            client_secret: env.GOOGLE_CLIENT_SECRET!,
            refresh_token: account.refreshToken,
            grant_type: "refresh_token",
          });

          const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenBody.toString(),
          });

          if (!tokenRes.ok) {
            console.error(`Token refresh failed for ${key.name}: ${tokenRes.status}`);
            return;
          }

          const tokens = (await tokenRes.json()) as { access_token: string };

          await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              topicName: account.pubsubTopic,
              labelIds: ["INBOX"],
            }),
          });
        },
        catch: (e) => new Error(`Watch re-registration failed for ${key.name}: ${e}`),
      }).pipe(
        Effect.catchAll((error) => {
          console.error(error);
          return Effect.void;
        }),
      );
    }
  }).pipe(
    Effect.catchAll((error) => {
      console.error("reregisterGmailWatch failed:", error);
      return Effect.void;
    }),
  );

  await Effect.runPromise(program);
}
