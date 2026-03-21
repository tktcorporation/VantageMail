/**
 * Gmail sync hook.
 *
 * Triggers initial thread fetch for all connected accounts after mount.
 * Calls the server-side /api/threads endpoint which handles token management,
 * then populates the threads store with the results.
 */
import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand";
import type { AccountsStore, ThreadsStore, Thread } from "@vantagemail/core";

interface UseSyncOptions {
  accountsStore: StoreApi<AccountsStore>;
  threadsStore: StoreApi<ThreadsStore>;
  /** Base URL for API calls. Defaults to "" (same origin). */
  apiBase?: string;
}

/**
 * Fetch threads for all accounts on mount.
 * Avoids duplicate fetches with a ref guard.
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
          const threads: Thread[] = (data.threads ?? []).map(
            (t: Thread & { lastMessageAt: string }) => ({
              ...t,
              lastMessageAt: new Date(t.lastMessageAt),
            }),
          );
          threadsStore.getState().setThreads(account.id, threads);
        } catch (err) {
          console.error(`Sync error for ${account.email}:`, err);
        }
      }),
    ).finally(() => {
      threadsStore.getState().setLoading(false);
    });
  }, [accountsStore, threadsStore, apiBase]);
}
