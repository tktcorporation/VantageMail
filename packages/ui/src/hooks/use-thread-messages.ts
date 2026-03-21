/**
 * Hook to fetch full message bodies for a thread.
 *
 * Calls /api/threads/:threadId?accountId=xxx to get message contents.
 * Results are cached per threadId to avoid redundant API calls.
 *
 * Schema.decodeUnknownSync を使って API レスポンスの ISO 日時文字列を
 * Date オブジェクトにデコードする。手動の型アサーション + new Date() を排除。
 */
import { useState, useEffect, useRef } from "react";
import { Schema } from "@effect/schema";
import type { Message } from "@vantagemail/core";

/**
 * /api/threads/:id レスポンス用のメッセージスキーマ。
 *
 * 背景: API レスポンスでは date が ISO 文字列で返るため、
 * DateFromString で自動的に Date へデコードする。
 * MessageSchema (DateFromSelf) とは異なり、JSON シリアライズ境界のデコードに使う。
 */
const ApiEmailContactSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

const ApiAttachmentSchema = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
});

const ApiMessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  accountId: Schema.String,
  from: ApiEmailContactSchema,
  to: Schema.Array(ApiEmailContactSchema),
  cc: Schema.Array(ApiEmailContactSchema),
  subject: Schema.String,
  snippet: Schema.String,
  bodyHtml: Schema.String,
  bodyText: Schema.String,
  date: Schema.DateFromString,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  attachments: Schema.Array(ApiAttachmentSchema),
});

/** /api/threads/:id のレスポンス全体 */
const ApiMessagesResponseSchema = Schema.Struct({
  messages: Schema.optional(Schema.Array(ApiMessageSchema)),
});

const decodeMessagesResponse = Schema.decodeUnknownSync(ApiMessagesResponseSchema);

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
        const data = await res.json();
        const { messages: rawMsgs } = decodeMessagesResponse(data);
        // Schema.decodeUnknownSync は readonly 配列を返すため、
        // Message[] に合わせてスプレッドでコピーする。
        return [...(rawMsgs ?? [])] as Message[];
      })
      .then((msgs) => {
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
