/**
 * Threads API (GET /api/threads?accountId=xxx).
 *
 * Fetches Gmail threads for the given account using server-side tokens.
 * Returns Thread[] in the app's normalized format (no raw Gmail data exposed).
 */
import { createFileRoute } from "@tanstack/react-router";
import { gmailFetch } from "~/lib/gmail-server";
import { adaptGmailThread } from "@vantagemail/core";
import type { GmailThread } from "@vantagemail/core";

interface GmailThreadListResponse {
  threads?: Array<{ id: string; historyId: string; snippet: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export const Route = createFileRoute("/api/threads/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId");
        if (!accountId) {
          return Response.json({ error: "accountId is required" }, { status: 400 });
        }

        const maxResults = url.searchParams.get("maxResults") ?? "30";

        // 1. Get thread ID list
        const listResult = await gmailFetch<GmailThreadListResponse>(
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
          const results = await Promise.all(
            batch.map((t) =>
              gmailFetch<GmailThread>(accountId, `/threads/${t.id}?format=metadata`),
            ),
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
      },
    },
  },
});
