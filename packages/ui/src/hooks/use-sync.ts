/**
 * Gmail sync hook.
 *
 * Triggers initial thread fetch for all connected accounts after mount.
 * Calls the server-side /api/threads endpoint which handles token management,
 * then populates the threads store with the results.
 *
 * Schema.decodeUnknownSync を使って API レスポンスの ISO 日時文字列を
 * Date オブジェクトにデコードする。手動の型アサーション + new Date() を排除。
 */
import { useCallback, useEffect, useRef } from "react";
import { Schema } from "@effect/schema";
import type { StoreApi } from "zustand";
import type { AccountsStore, ThreadsStore } from "@vantagemail/core";

/**
 * /api/threads レスポンス用のスキーマ。
 *
 * 背景: API レスポンスでは lastMessageAt / snoozedUntil が ISO 文字列で返るため、
 * DateFromString で自動的に Date へデコードする。
 * ThreadSchema (DateFromSelf) とは異なり、JSON シリアライズ境界のデコードに使う。
 */
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

/** /api/threads のレスポンス全体（nextPageToken を含む） */
const ApiThreadsResponseSchema = Schema.Struct({
  threads: Schema.optional(Schema.Array(ApiThreadSchema)),
  nextPageToken: Schema.optional(Schema.String),
});

const decodeThreadsResponse = Schema.decodeUnknownSync(ApiThreadsResponseSchema);

interface UseSyncOptions {
  accountsStore: StoreApi<AccountsStore>;
  threadsStore: StoreApi<ThreadsStore>;
  /** Base URL for API calls. Defaults to "" (same origin). */
  apiBase?: string;
}

/**
 * Fetch threads for all accounts on mount, and provide fetchMore for infinite scroll.
 * Avoids duplicate fetches with a ref guard.
 *
 * @returns fetchMore — 全アカウントの次ページを取得する関数。
 *   pageToken が残っているアカウントのみ追加ロードする。
 */
export function useSync({ accountsStore, threadsStore, apiBase = "" }: UseSyncOptions) {
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const accounts = accountsStore.getState().accounts;
    if (accounts.length === 0) return;

    threadsStore.getState().setLoading(true);

    Promise.all(
      accounts.map(async (account) => {
        try {
          const res = await fetch(
            `${apiBase}/api/threads?accountId=${encodeURIComponent(account.id)}`,
          );
          if (!res.ok) {
            console.error(`Failed to fetch threads for ${account.email}:`, res.status);
            return;
          }
          const data = await res.json();
          const { threads: rawThreads, nextPageToken } = decodeThreadsResponse(data);
          // Schema.decodeUnknownSync は readonly 配列を返すため、
          // ストアの mutable Thread[] に合わせてスプレッドでコピーする。
          const threads = [...(rawThreads ?? [])];
          threadsStore.getState().setThreads(account.id, threads, nextPageToken);
        } catch (err) {
          console.error(`Sync error for ${account.email}:`, err);
        }
      }),
    ).finally(() => {
      threadsStore.getState().setLoading(false);
    });
  }, [accountsStore, threadsStore, apiBase]);

  /**
   * 全アカウントの次ページを取得する（無限スクロール用）。
   *
   * pageToken が残っているアカウントのみ追加フェッチし、
   * 結果を appendThreads でマージする。
   * 全アカウントの pageToken が枯渇していれば何もしない。
   */
  const fetchMore = useCallback(async () => {
    const state = threadsStore.getState();
    if (state.isLoadingMore) return;

    const accounts = accountsStore.getState().accounts;
    // pageToken が残っているアカウントだけ抽出
    const accountsWithMore = accounts.filter(
      (a) => state.pageTokenByAccount[a.id] != null,
    );
    if (accountsWithMore.length === 0) return;

    state.setLoadingMore(true);

    try {
      await Promise.all(
        accountsWithMore.map(async (account) => {
          const pageToken = threadsStore.getState().pageTokenByAccount[account.id];
          if (!pageToken) return;
          try {
            const res = await fetch(
              `${apiBase}/api/threads?accountId=${encodeURIComponent(account.id)}&pageToken=${encodeURIComponent(pageToken)}`,
            );
            if (!res.ok) {
              console.error(`Failed to fetch more threads for ${account.email}:`, res.status);
              return;
            }
            const data = await res.json();
            const { threads: rawThreads, nextPageToken } = decodeThreadsResponse(data);
            const threads = [...(rawThreads ?? [])];
            threadsStore.getState().appendThreads(account.id, threads, nextPageToken);
          } catch (err) {
            console.error(`FetchMore error for ${account.email}:`, err);
          }
        }),
      );
    } finally {
      threadsStore.getState().setLoadingMore(false);
    }
  }, [accountsStore, threadsStore, apiBase]);

  return { fetchMore };
}
