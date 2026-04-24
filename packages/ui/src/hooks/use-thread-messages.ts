/**
 * Hook to fetch full message bodies for a thread.
 *
 * Calls /api/threads/:threadId?accountId=xxx to get message contents.
 * Results are cached per threadId to avoid redundant API calls.
 *
 * Effect TS でエラーを TaggedError として扱い、UI 側で ts-pattern による
 * 出し分けを可能にする。特に 401 + AuthExpiredError を専用タグに昇格させ、
 * accountsStore の connectionStatus を更新することで再ログインバナーに繋げる。
 *
 * Schema.decodeUnknown を使って API レスポンスの ISO 日時文字列を
 * Date オブジェクトにデコードする。
 */
import { useState, useEffect, useRef } from "react";
import { Data, Effect } from "effect";
import { Schema } from "@effect/schema";
import { match } from "ts-pattern";
import type { Message } from "@vantagemail/core";
import { useStoreApis } from "./use-store";

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

/**
 * /api/threads/:id が 401 で返す認証期限切れレスポンスの形状。
 * runtime.ts:84-90 (handleEffect) が投入する JSON と一致させる。
 */
const AuthExpiredResponseSchema = Schema.Struct({
  error: Schema.Literal("AuthExpiredError"),
  accountId: Schema.String,
});

// --- エラー型 ---
// thread-view 側で ts-pattern + _tag で分岐し、
// 認証切れ時とその他のエラーでメッセージを出し分ける。

class FetchMessagesNetworkError extends Data.TaggedError("FetchMessagesNetworkError")<{
  readonly cause: unknown;
}> {}

class FetchMessagesStatusError extends Data.TaggedError("FetchMessagesStatusError")<{
  readonly status: number;
}> {}

/**
 * メッセージ取得時にアカウント認証が期限切れだった。
 * thread-view はこのタグを受けて「再ログインしてください」と案内する。
 */
class MessagesAuthExpiredError extends Data.TaggedError("MessagesAuthExpiredError")<{
  readonly accountId: string;
}> {}

class MessagesDecodeError extends Data.TaggedError("MessagesDecodeError")<{
  readonly cause: unknown;
}> {}

export type FetchMessagesError =
  | FetchMessagesNetworkError
  | FetchMessagesStatusError
  | MessagesAuthExpiredError
  | MessagesDecodeError;

/**
 * 1 スレッド分のメッセージを Effect で取得する。
 * fetch → status チェック → JSON decode → Schema decode を型付きエラーで連鎖。
 */
function fetchThreadMessages(params: {
  threadId: string;
  accountId: string;
}): Effect.Effect<Message[], FetchMessagesError> {
  const { threadId, accountId } = params;
  const url = `/api/threads/${threadId}?accountId=${encodeURIComponent(accountId)}`;

  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (cause) => new FetchMessagesNetworkError({ cause }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        const body = yield* Effect.tryPromise({
          try: () => res.json() as Promise<unknown>,
          catch: () => new FetchMessagesStatusError({ status: res.status }),
        });
        const parsed = yield* Schema.decodeUnknown(AuthExpiredResponseSchema)(body).pipe(
          Effect.option,
        );
        if (parsed._tag === "Some") {
          return yield* new MessagesAuthExpiredError({ accountId: parsed.value.accountId });
        }
      }
      return yield* new FetchMessagesStatusError({ status: res.status });
    }

    const json = yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (cause) => new MessagesDecodeError({ cause }),
    });

    const decoded = yield* Schema.decodeUnknown(ApiMessagesResponseSchema)(json).pipe(
      Effect.mapError((cause) => new MessagesDecodeError({ cause })),
    );

    // Schema.decodeUnknown は readonly 配列を返すため、Message[] に合わせてコピー。
    return [...(decoded.messages ?? [])] as Message[];
  });
}

interface UseThreadMessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: FetchMessagesError | null;
}

export function useThreadMessages(
  threadId: string | null,
  accountId: string | null,
): UseThreadMessagesResult {
  const { accountsStore } = useStoreApis();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FetchMessagesError | null>(null);
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

    const program = fetchThreadMessages({ threadId, accountId }).pipe(
      Effect.tap((msgs) =>
        Effect.sync(() => {
          if (cancelled) return;
          cache.current[threadId] = msgs;
          setMessages(msgs);
          // メッセージ取得成功 = トークンが生きている。期限切れ状態からの復帰を反映。
          accountsStore.getState().setConnectionStatus(accountId, "connected");
        }),
      ),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          if (cancelled) return;
          // 認証期限切れは accountsStore に反映してバナーを出す。
          // その他のエラーは UI にエラータグを渡して表示。
          match(err)
            .with({ _tag: "MessagesAuthExpiredError" }, (e) => {
              accountsStore.getState().setConnectionStatus(e.accountId, "token_expired");
            })
            .otherwise(() => {
              // no-op: 下の setError で UI に伝える
            });
          setError(err);
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (!cancelled) setIsLoading(false);
        }),
      ),
    );

    void Effect.runPromise(program);

    return () => {
      cancelled = true;
    };
  }, [threadId, accountId, accountsStore]);

  return { messages, isLoading, error };
}
