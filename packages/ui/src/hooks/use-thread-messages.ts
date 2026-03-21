/**
 * Hook to fetch full message bodies for a thread.
 *
 * Calls /api/threads/:threadId?accountId=xxx to get message contents.
 * Results are cached per threadId to avoid redundant API calls.
 */
import { useState, useEffect, useRef } from "react";
import type { Message } from "@vantagemail/core";

interface UseThreadMessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export function useThreadMessages(
  threadId: string | null,
  accountId: string | null,
): UseThreadMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Record<string, Message[]>>({});

  useEffect(() => {
    if (!threadId || !accountId) {
      setMessages([]);
      return;
    }

    // Return cached result
    if (cache.current[threadId]) {
      setMessages(cache.current[threadId]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/threads/${threadId}?accountId=${encodeURIComponent(accountId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        // API レスポンスでは date が ISO 文字列で返る
        const data = (await res.json()) as {
          messages?: (Omit<Message, "date"> & { date: string })[];
        };
        return (data.messages ?? []).map((m) => ({
          ...m,
          date: new Date(m.date),
        }));
      })
      .then((msgs: Message[]) => {
        if (cancelled) return;
        cache.current[threadId] = msgs;
        setMessages(msgs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [threadId, accountId]);

  return { messages, isLoading, error };
}
