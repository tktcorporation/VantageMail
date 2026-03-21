/**
 * Thread detail API (GET /api/threads/:threadId?accountId=xxx).
 *
 * Fetches full thread with message bodies from Gmail API.
 * Returns Message[] in the app's normalized format.
 */
import { createFileRoute } from "@tanstack/react-router";
import { gmailFetch } from "~/lib/gmail-server";
import { adaptGmailMessage } from "@vantagemail/core";
import type { GmailThread } from "@vantagemail/core";

export const Route = createFileRoute("/api/threads/$threadId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId");
        const { threadId } = params;

        if (!accountId) {
          return Response.json({ error: "accountId is required" }, { status: 400 });
        }

        const gmailThread = await gmailFetch<GmailThread>(
          accountId,
          `/threads/${threadId}?format=full`,
        );

        if (!gmailThread) {
          return Response.json({ error: "thread not found" }, { status: 404 });
        }

        const messages = (gmailThread.messages ?? []).map((msg) => {
          const message = adaptGmailMessage(msg, accountId);
          return {
            ...message,
            date: message.date.toISOString(),
          };
        });

        return Response.json({ messages });
      },
    },
  },
});
