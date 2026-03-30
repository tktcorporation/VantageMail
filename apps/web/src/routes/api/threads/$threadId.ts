/**
 * Thread detail API (GET /api/threads/:threadId?accountId=xxx).
 *
 * 背景: Gmail API からスレッドの全メッセージ本文を取得し、
 * アプリの正規化フォーマット（Message[]）に変換して返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { adaptGmailMessage } from "@vantagemail/core";
import type { GmailThread } from "@vantagemail/core";
import { gmailFetch } from "~/lib/gmail-server.ts";
import { getEnv, handleEffect } from "~/lib/runtime.ts";

export const Route = createFileRoute("/api/threads/$threadId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const env = await getEnv();
        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId");
        const { threadId } = params;

        if (!accountId) {
          return Response.json({ error: "accountId is required" }, { status: 400 });
        }

        const effect = Effect.gen(function* () {
          const gmailThread = yield* gmailFetch<GmailThread>(
            accountId,
            `/threads/${threadId}?format=full`,
          );

          const messages = (gmailThread.messages ?? []).map((msg) => {
            const message = adaptGmailMessage(msg, accountId);
            return {
              ...message,
              date: message.date.toISOString(),
            };
          });

          return Response.json({ messages });
        });

        return handleEffect(effect, env);
      },
    },
  },
});
