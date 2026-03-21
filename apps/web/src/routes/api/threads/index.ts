/**
 * Threads API (GET /api/threads?accountId=xxx).
 *
 * 背景: 指定アカウントの Gmail スレッド一覧をサーバーサイドトークンで取得する。
 * Gmail API のレスポンスをアプリの正規化フォーマット（Thread[]）に変換して返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { adaptGmailThread } from "@vantagemail/core";
import type { GmailThread } from "@vantagemail/core";
import { gmailFetch } from "~/lib/gmail-server.ts";
import { getEnv, handleEffect } from "~/lib/runtime.ts";

interface GmailThreadListResponse {
  threads?: Array<{ id: string; historyId: string; snippet: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export const Route = createFileRoute("/api/threads/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = await getEnv();
        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId");

        if (!accountId) {
          return Response.json({ error: "accountId is required" }, { status: 400 });
        }

        const maxResults = url.searchParams.get("maxResults") ?? "30";

        const effect = Effect.gen(function* () {
          // 1. Get thread ID list
          const listResult = yield* gmailFetch<GmailThreadListResponse>(
            accountId,
            `/threads?labelIds=INBOX&maxResults=${maxResults}`,
          );

          if (!listResult?.threads?.length) {
            return Response.json({ threads: [] });
          }

          // 2. Fetch thread details in parallel batches
          const batchSize = 10;
          const threads = [];

          for (let i = 0; i < listResult.threads.length; i += batchSize) {
            const batch = listResult.threads.slice(i, i + batchSize);
            const results = yield* Effect.all(
              batch.map((t) =>
                gmailFetch<GmailThread>(accountId, `/threads/${t.id}?format=metadata`),
              ),
              { concurrency: "unbounded" },
            );
            for (const gmailThread of results) {
              if (gmailThread) {
                const thread = adaptGmailThread(gmailThread, accountId);
                // Date objects don't serialize properly in JSON, convert to ISO string
                threads.push({
                  ...thread,
                  lastMessageAt: thread.lastMessageAt.toISOString(),
                });
              }
            }
          }

          return Response.json({ threads });
        });

        return handleEffect(effect, env);
      },
    },
  },
});
