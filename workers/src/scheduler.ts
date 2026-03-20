/**
 * スケジューラー — スヌーズ/送信予約 + Gmail watch 再登録
 *
 * 背景: Cron Triggers で毎分ジョブチェック、6日ごとに watch 再登録。
 */
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
    case "POST": return createJob(request, env);
    case "DELETE": return cancelJob(request, env);
    case "GET": return listJobs(request, env);
    default: return new Response("Method not allowed", { status: 405 });
  }
}

async function createJob(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    type: "snooze" | "send_later";
    executeAt: number;
    accountEmail: string;
    threadId?: string;
    rawMessage?: string;
  }>();

  if (!body.type || !body.executeAt || !body.accountEmail) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const job: ScheduledJob = { id, ...body, createdAt: Date.now() };
  const key = `job:${body.executeAt}:${id}`;

  await env.SCHEDULED_JOBS.put(key, JSON.stringify(job));

  // アカウントごとのインデックス
  const idxKey = `idx:${body.accountEmail}`;
  const existing = await env.SCHEDULED_JOBS.get(idxKey);
  const jobIds: string[] = existing ? JSON.parse(existing) : [];
  jobIds.push(key);
  await env.SCHEDULED_JOBS.put(idxKey, JSON.stringify(jobIds));

  return Response.json({ id, key }, { status: 201 });
}

async function cancelJob(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ key: string; accountEmail: string }>();
  if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });

  await env.SCHEDULED_JOBS.delete(body.key);

  if (body.accountEmail) {
    const idxKey = `idx:${body.accountEmail}`;
    const existing = await env.SCHEDULED_JOBS.get(idxKey);
    if (existing) {
      const jobIds: string[] = JSON.parse(existing);
      await env.SCHEDULED_JOBS.put(idxKey, JSON.stringify(jobIds.filter((k) => k !== body.key)));
    }
  }
  return Response.json({ ok: true });
}

async function listJobs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) return Response.json({ error: "Missing email" }, { status: 400 });

  const existing = await env.SCHEDULED_JOBS.get(`idx:${email}`);
  const jobKeys: string[] = existing ? JSON.parse(existing) : [];

  const jobs: ScheduledJob[] = [];
  for (const key of jobKeys) {
    const data = await env.SCHEDULED_JOBS.get(key);
    if (data) jobs.push(JSON.parse(data));
  }
  return Response.json({ jobs });
}

// ─── Cron ハンドラ ───

/** 毎分: 期限が来たジョブを処理 */
export async function processScheduledJobs(env: Env, ctx: ExecutionContext): Promise<void> {
  const now = Date.now();
  const jobKeys = await env.SCHEDULED_JOBS.list({ prefix: "job:" });

  for (const key of jobKeys.keys) {
    const parts = key.name.split(":");
    const executeAt = Number(parts[1]);
    if (executeAt > now) continue;

    const jobData = await env.SCHEDULED_JOBS.get(key.name);
    if (!jobData) continue;

    const job = JSON.parse(jobData) as ScheduledJob;
    ctx.waitUntil(
      processJob(job, env).finally(() => env.SCHEDULED_JOBS.delete(key.name)),
    );
  }
}

async function processJob(job: ScheduledJob, env: Env): Promise<void> {
  // Durable Object に通知 → WebSocket → クライアント
  const doId = env.PUSH_CONNECTIONS.idFromName(job.accountEmail);
  const stub = env.PUSH_CONNECTIONS.get(doId);

  await stub.fetch(new Request("http://internal/notify", {
    method: "POST",
    body: JSON.stringify({
      emailAddress: job.accountEmail,
      type: job.type === "snooze" ? "snooze_restore" : "send_scheduled",
      threadId: job.threadId,
      rawMessage: job.rawMessage,
    }),
  }));
}

/** 6日ごと: Gmail watch() の再登録 */
export async function reregisterGmailWatch(env: Env): Promise<void> {
  const accounts = await env.WATCH_STATE.list({ prefix: "watch:" });

  for (const key of accounts.keys) {
    const data = await env.WATCH_STATE.get(key.name);
    if (!data) continue;

    const account = JSON.parse(data) as {
      clientId: string;
      refreshToken: string;
      pubsubTopic: string;
    };

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
      console.error(`Token refresh failed for ${key.name}: ${tokenRes.status}`);
      continue;
    }

    const tokens = await tokenRes.json<{ access_token: string }>();

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
  }
}
