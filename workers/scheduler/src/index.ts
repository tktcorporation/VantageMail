/**
 * Scheduler Worker — スヌーズ/送信予約を CF Cron Triggers + KV で実現
 *
 * 背景: スヌーズ（受信トレイから一時除去→指定時刻に再表示）と送信予約
 * （指定時刻にメール送信）を GCP スケジューラーではなく Cloudflare の
 * Cron Triggers で実装する。毎分 Cron が走り、期限が来たジョブを処理。
 *
 * KV のデータ構造:
 * - key: "job:{timestamp}:{uuid}" — タイムスタンプ順でリスト取得可能
 * - value: JSON — ジョブの詳細（type, accountEmail, threadId 等）
 * - key: "idx:{accountEmail}" — アカウントごとのジョブIDリスト（キャンセル用）
 *
 * エンドポイント:
 * - POST /schedule   — 新しいジョブを登録（クライアントから）
 * - DELETE /schedule  — ジョブをキャンセル
 * - GET /schedule     — アカウントのジョブ一覧を取得
 */

interface Env {
  SCHEDULED_JOBS: KVNamespace;
  PUSH_RELAY_URL: string;
}

/** スケジュールされたジョブの型 */
interface ScheduledJob {
  id: string;
  type: "snooze" | "send_later";
  /** 実行予定時刻（Unix timestamp ミリ秒） */
  executeAt: number;
  accountEmail: string;
  /** スヌーズ: 再表示するスレッドID */
  threadId?: string;
  /** 送信予約: RFC 2822 形式のメールデータ（base64url） */
  rawMessage?: string;
  /** ジョブ作成時刻 */
  createdAt: number;
}

export default {
  /**
   * Cron Trigger ハンドラ — 毎分実行。
   * 期限が来たジョブを KV から取得して処理する。
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const now = Date.now();
    // KV list でプレフィクス "job:" のキーを取得し、タイムスタンプでフィルタ
    const jobKeys = await env.SCHEDULED_JOBS.list({ prefix: "job:" });

    for (const key of jobKeys.keys) {
      // key format: "job:{timestamp}:{uuid}"
      const parts = key.name.split(":");
      const executeAt = Number(parts[1]);

      if (executeAt > now) continue; // まだ時間が来てないジョブはスキップ

      const jobData = await env.SCHEDULED_JOBS.get(key.name);
      if (!jobData) continue;

      const job = JSON.parse(jobData) as ScheduledJob;

      ctx.waitUntil(
        processJob(job, env).finally(() =>
          // 処理済みジョブを削除
          env.SCHEDULED_JOBS.delete(key.name),
        ),
      );
    }
  },

  /**
   * HTTP ハンドラ — ジョブの登録・キャンセル・一覧。
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/schedule") {
      return new Response("Not found", { status: 404 });
    }

    switch (request.method) {
      case "POST":
        return handleCreateJob(request, env);
      case "DELETE":
        return handleCancelJob(request, env);
      case "GET":
        return handleListJobs(request, env);
      default:
        return new Response("Method not allowed", { status: 405 });
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * ジョブを処理する。
 *
 * - スヌーズ: push-relay Worker に「スレッド再表示」通知を送る。
 *   クライアントが通知を受け取って Gmail API で INBOX ラベルを復元する。
 * - 送信予約: OAuth プロキシ経由で Gmail API にメールを送信する。
 *   （将来実装: 現時点ではクライアントに通知して送信を委任）
 */
async function processJob(job: ScheduledJob, env: Env): Promise<void> {
  switch (job.type) {
    case "snooze": {
      // push-relay Worker に通知 → WebSocket → クライアント
      // クライアント側で Gmail API の modifyThread を呼んで INBOX ラベルを復元
      await fetch(`${env.PUSH_RELAY_URL}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            data: btoa(JSON.stringify({
              emailAddress: job.accountEmail,
              // スヌーズ復帰を示す特別な通知
              type: "snooze_restore",
              threadId: job.threadId,
            })),
            messageId: `snooze-${job.id}`,
          },
        }),
      });
      break;
    }

    case "send_later": {
      // クライアントに送信指示を通知
      // クライアント側で Gmail API の messages.send を呼ぶ
      await fetch(`${env.PUSH_RELAY_URL}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            data: btoa(JSON.stringify({
              emailAddress: job.accountEmail,
              type: "send_scheduled",
              rawMessage: job.rawMessage,
            })),
            messageId: `send-${job.id}`,
          },
        }),
      });
      break;
    }
  }
}

/** 新しいジョブを登録する */
async function handleCreateJob(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    type: "snooze" | "send_later";
    executeAt: number;
    accountEmail: string;
    threadId?: string;
    rawMessage?: string;
  }>();

  if (!body.type || !body.executeAt || !body.accountEmail) {
    return Response.json(
      { error: "Missing required fields: type, executeAt, accountEmail" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const job: ScheduledJob = {
    id,
    type: body.type,
    executeAt: body.executeAt,
    accountEmail: body.accountEmail,
    threadId: body.threadId,
    rawMessage: body.rawMessage,
    createdAt: Date.now(),
  };

  // タイムスタンプをキーに含めることで、list 時に時系列順になる
  const key = `job:${body.executeAt}:${id}`;
  await env.SCHEDULED_JOBS.put(key, JSON.stringify(job));

  // アカウントごとのインデックスに追加（キャンセル・一覧表示用）
  const idxKey = `idx:${body.accountEmail}`;
  const existing = await env.SCHEDULED_JOBS.get(idxKey);
  const jobIds: string[] = existing ? JSON.parse(existing) : [];
  jobIds.push(key);
  await env.SCHEDULED_JOBS.put(idxKey, JSON.stringify(jobIds));

  return Response.json({ id, key }, { status: 201 });
}

/** ジョブをキャンセルする */
async function handleCancelJob(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ key: string; accountEmail: string }>();

  if (!body.key) {
    return Response.json({ error: "Missing key" }, { status: 400 });
  }

  await env.SCHEDULED_JOBS.delete(body.key);

  // インデックスからも削除
  if (body.accountEmail) {
    const idxKey = `idx:${body.accountEmail}`;
    const existing = await env.SCHEDULED_JOBS.get(idxKey);
    if (existing) {
      const jobIds: string[] = JSON.parse(existing);
      const filtered = jobIds.filter((k) => k !== body.key);
      await env.SCHEDULED_JOBS.put(idxKey, JSON.stringify(filtered));
    }
  }

  return Response.json({ ok: true });
}

/** アカウントのジョブ一覧を取得する */
async function handleListJobs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accountEmail = url.searchParams.get("email");

  if (!accountEmail) {
    return Response.json({ error: "Missing email parameter" }, { status: 400 });
  }

  const idxKey = `idx:${accountEmail}`;
  const existing = await env.SCHEDULED_JOBS.get(idxKey);
  const jobKeys: string[] = existing ? JSON.parse(existing) : [];

  const jobs: ScheduledJob[] = [];
  for (const key of jobKeys) {
    const data = await env.SCHEDULED_JOBS.get(key);
    if (data) jobs.push(JSON.parse(data));
  }

  return Response.json({ jobs });
}
