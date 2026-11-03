/** Fetch inbox or Gmail search results for every connected account. */
import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { Data, Effect } from "effect";
import { Schema } from "@effect/schema";
import type { StoreApi } from "zustand";
import type { AccountsStore, ThreadsStore } from "@vantagemail/core";

const ApiThreadSchema = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  lastMessageAt: Schema.DateFromString,
  participants: Schema.Array(Schema.String),
  messageCount: Schema.Number,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  snoozedUntil: Schema.optional(Schema.DateFromString),
  isPinned: Schema.Boolean,
});
const ApiThreadsResponseSchema = Schema.Struct({
  threads: Schema.optional(Schema.Array(ApiThreadSchema)),
  nextPageToken: Schema.optional(Schema.String),
});
type ThreadsResponse = Schema.Schema.Type<typeof ApiThreadsResponseSchema>;

class FetchNetworkError extends Data.TaggedError("FetchNetworkError")<{}> {}
class FetchStatusError extends Data.TaggedError("FetchStatusError")<{ readonly status: number }> {}
class AccountAuthExpiredError extends Data.TaggedError("AccountAuthExpiredError")<{
  readonly accountId: string;
}> {}
class ResponseDecodeError extends Data.TaggedError("ResponseDecodeError")<{}> {}
type SyncError =
  | FetchNetworkError
  | FetchStatusError
  | AccountAuthExpiredError
  | ResponseDecodeError;

const AuthExpiredResponseSchema = Schema.Struct({
  error: Schema.Literal("AuthExpiredError"),
  accountId: Schema.String,
});

function fetchAccountThreads(params: {
  apiBase: string;
  accountId: string;
  query: string;
  signal: AbortSignal;
  pageToken?: string;
}): Effect.Effect<ThreadsResponse, SyncError> {
  const { apiBase, accountId, query, signal, pageToken } = params;
  const qs = new URLSearchParams({ accountId });
  if (query) qs.set("q", query);
  if (pageToken) qs.set("pageToken", pageToken);
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch(`${apiBase}/api/threads?${qs.toString()}`, { signal }),
      catch: () => new FetchNetworkError(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        const body = yield* Effect.tryPromise({
          try: () => res.json() as Promise<unknown>,
          catch: () => new FetchStatusError({ status: res.status }),
        });
        const parsed = yield* Schema.decodeUnknown(AuthExpiredResponseSchema)(body).pipe(
          Effect.option,
        );
        if (parsed._tag === "Some" && parsed.value.accountId === accountId) {
          return yield* new AccountAuthExpiredError({ accountId });
        }
      }
      return yield* new FetchStatusError({ status: res.status });
    }
    const json = yield* Effect.tryPromise({
      try: () => res.json() as Promise<unknown>,
      catch: () => new ResponseDecodeError(),
    });
    return yield* Schema.decodeUnknown(ApiThreadsResponseSchema)(json).pipe(
      Effect.mapError(() => new ResponseDecodeError()),
    );
  });
}

interface UseSyncOptions {
  accountsStore: StoreApi<AccountsStore>;
  threadsStore: StoreApi<ThreadsStore>;
  apiBase?: string;
}

export function useSync({ accountsStore, threadsStore, apiBase = "" }: UseSyncOptions) {
  const accounts = useStore(accountsStore, (state) => state.accounts);
  const query = useStore(threadsStore, (state) => state.searchQuery);
  const refreshVersion = useStore(threadsStore, (state) => state.refreshVersion);
  const requestRef = useRef(0);

  const recordError = useCallback(
    (accountId: string, error: SyncError, clearRows = true) => {
      // A failed first-page refresh invalidates previous rows; a failed extra page does not.
      if (clearRows) threadsStore.getState().setThreads(accountId, []);
      if (error._tag === "AccountAuthExpiredError") {
        accountsStore.getState().setConnectionStatus(accountId, "token_expired");
      }
      const state = threadsStore.getState();
      if (!state.failedAccountIds.includes(accountId)) {
        state.setFailedAccountIds([...state.failedAccountIds, accountId]);
      }
    },
    [accountsStore, threadsStore],
  );

  useEffect(() => {
    const request = ++requestRef.current;
    const controller = new AbortController();
    const state = threadsStore.getState();
    state.setLoading(true);
    state.setLoadingMore(false);
    state.setFailedAccountIds([]);
    // An account removed since the previous fetch must not leave rows in the unified list.
    for (const id of Object.keys(state.threadsByAccount)) {
      if (!accounts.some((account) => account.id === id)) state.setThreads(id, []);
    }
    const isCurrent = () => requestRef.current === request && !controller.signal.aborted;
    void Promise.all(
      accounts.map(async (account) => {
        const result = await Effect.runPromise(
          Effect.either(
            fetchAccountThreads({
              apiBase,
              accountId: account.id,
              query,
              signal: controller.signal,
            }),
          ),
        );
        if (!isCurrent()) return;
        if (result._tag === "Left") {
          recordError(account.id, result.left);
        } else {
          threadsStore
            .getState()
            .setThreads(account.id, [...(result.right.threads ?? [])], result.right.nextPageToken);
          accountsStore.getState().setConnectionStatus(account.id, "connected");
        }
      }),
    ).then(() => {
      if (isCurrent()) threadsStore.getState().setLoading(false);
    });
    return () => {
      controller.abort();
      requestRef.current++;
    };
  }, [accounts, accountsStore, threadsStore, apiBase, query, refreshVersion, recordError]);

  const fetchMore = useCallback(async () => {
    const state = threadsStore.getState();
    if (state.isLoading || state.isLoadingMore) return;
    const pending = accounts.flatMap((account) => {
      const token = state.pageTokenByAccount[account.id];
      return token ? [{ account, token }] : [];
    });
    if (!pending.length) return;
    const request = requestRef.current;
    const currentQuery = state.searchQuery;
    const controller = new AbortController();
    const isCurrent = () =>
      requestRef.current === request && threadsStore.getState().searchQuery === currentQuery;
    state.setLoadingMore(true);
    await Promise.all(
      pending.map(async ({ account, token }) => {
        const result = await Effect.runPromise(
          Effect.either(
            fetchAccountThreads({
              apiBase,
              accountId: account.id,
              query: currentQuery,
              pageToken: token,
              signal: controller.signal,
            }),
          ),
        );
        if (!isCurrent() || threadsStore.getState().pageTokenByAccount[account.id] !== token)
          return;
        if (result._tag === "Left") recordError(account.id, result.left, false);
        else {
          threadsStore
            .getState()
            .appendThreads(
              account.id,
              [...(result.right.threads ?? [])],
              result.right.nextPageToken,
            );
          accountsStore.getState().setConnectionStatus(account.id, "connected");
        }
      }),
    );
    if (isCurrent()) threadsStore.getState().setLoadingMore(false);
  }, [accounts, accountsStore, threadsStore, apiBase, recordError]);

  return { fetchMore };
}
