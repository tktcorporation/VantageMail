// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createAccountsStore, createThreadsStore } from "@vantagemail/core";
import type { Account } from "@vantagemail/core";
import { useSync } from "./use-sync";

const accounts: Account[] = ["first", "second"].map((id) => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  color: "#333333",
  unreadCount: 0,
  notificationsEnabled: true,
}));
const thread = (accountId: string, id: string) => ({
  id,
  accountId,
  subject: id,
  snippet: "fixture",
  lastMessageAt: "2026-01-01T00:00:00.000Z",
  participants: ["fixture@example.test"],
  messageCount: 1,
  labelIds: ["INBOX", "CATEGORY_PERSONAL"],
  isUnread: true,
  isStarred: false,
  isPinned: false,
});
const response = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const setup = () => {
  const accountsStore = createAccountsStore(accounts);
  const threadsStore = createThreadsStore();
  const hook = renderHook(() => useSync({ accountsStore, threadsStore }));
  return { accountsStore, threadsStore, ...hook };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSync", () => {
  it("keeps auth expiry distinct while showing a partial result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const id = new URL(input, "http://localhost").searchParams.get("accountId")!;
        return Promise.resolve(
          id === "second"
            ? response({ error: "AuthExpiredError", accountId: id }, 401)
            : response({ threads: [thread(id, "first-message")] }),
        );
      }),
    );
    const { accountsStore, threadsStore } = setup();
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    expect(threadsStore.getState().failedAccountIds).toEqual(["second"]);
    expect(threadsStore.getState().visibleThreadIds).toEqual(["first-message"]);
    expect(accountsStore.getState().connectionStatuses.second).toBe("token_expired");
  });

  it("one account failure preserves successful rows and retries both accounts", async () => {
    let failed = true;
    const fetchMock = vi.fn((input: string) => {
      const id = new URL(input, "http://localhost").searchParams.get("accountId")!;
      if (id === "second" && failed)
        return Promise.resolve(response({ error: "unavailable" }, 503));
      return Promise.resolve(response({ threads: [thread(id, `${id}-message`)] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { threadsStore } = setup();
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    expect(threadsStore.getState().failedAccountIds).toEqual(["second"]);
    expect(threadsStore.getState().visibleThreadIds).toEqual(["first-message"]);
    failed = false;
    act(() => threadsStore.getState().refreshThreads());
    await waitFor(() => expect(threadsStore.getState().visibleThreadIds).toHaveLength(2));
    expect(threadsStore.getState().failedAccountIds).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("search, empty results, and clear use distinct Gmail requests", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = new URL(input, "http://localhost");
        requests.push(url.search);
        const id = url.searchParams.get("accountId")!;
        return Promise.resolve(
          response({ threads: url.searchParams.has("q") ? [] : [thread(id, `${id}-inbox`)] }),
        );
      }),
    );
    const { threadsStore } = setup();
    await waitFor(() => expect(threadsStore.getState().visibleThreadIds).toHaveLength(2));
    act(() => threadsStore.getState().setSearchQuery("from:alice@example.test"));
    expect(threadsStore.getState().visibleThreadIds).toHaveLength(0);
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    expect(threadsStore.getState().failedAccountIds).toEqual([]);
    expect(requests.filter((url) => url.includes("q=from%3Aalice%40example.test"))).toHaveLength(2);
    act(() => threadsStore.getState().setSearchQuery(""));
    await waitFor(() => expect(threadsStore.getState().visibleThreadIds).toHaveLength(2));
    expect(requests.at(-1)).not.toContain("q=");
  });

  it("ignores a late response from the previous search", async () => {
    let releaseOld!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = new URL(input, "http://localhost");
        if (url.searchParams.get("q") === "old" && url.searchParams.get("accountId") === "first") {
          return new Promise<Response>((resolve) => {
            releaseOld = resolve;
          });
        }
        const id = url.searchParams.get("accountId")!;
        return Promise.resolve(
          response({ threads: [thread(id, `${url.searchParams.get("q") ?? "inbox"}-${id}`)] }),
        );
      }),
    );
    const { threadsStore } = setup();
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    act(() => threadsStore.getState().setSearchQuery("old"));
    await waitFor(() => expect(releaseOld).toBeDefined());
    act(() => threadsStore.getState().setSearchQuery("new"));
    await waitFor(() => expect(threadsStore.getState().visibleThreadIds).toContain("new-first"));
    await act(async () => releaseOld(response({ threads: [thread("first", "old-first")] })));
    expect(threadsStore.getState().visibleThreadIds).not.toContain("old-first");
  });

  it("does not append an old page after the search changes", async () => {
    const releasePages = new Map<string, (value: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = new URL(input, "http://localhost");
        const id = url.searchParams.get("accountId")!;
        if (url.searchParams.has("pageToken")) {
          return new Promise<Response>((resolve) => {
            releasePages.set(id, resolve);
          });
        }
        return Promise.resolve(
          response({
            threads: [thread(id, `${url.searchParams.get("q") ?? "inbox"}-${id}`)],
            nextPageToken: url.searchParams.has("q") ? undefined : "next",
          }),
        );
      }),
    );
    const { threadsStore, result } = setup();
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    let pageRequest!: Promise<void>;
    act(() => {
      pageRequest = result.current.fetchMore();
    });
    await waitFor(() => expect(releasePages.size).toBe(2));
    act(() => threadsStore.getState().setSearchQuery("new"));
    await waitFor(() => expect(threadsStore.getState().visibleThreadIds).toContain("new-first"));
    await act(async () => {
      releasePages.get("first")!(response({ threads: [thread("first", "old-page")] }));
      releasePages.get("second")!(response({ threads: [thread("second", "old-page-2")] }));
      await pageRequest;
    });
    expect(threadsStore.getState().visibleThreadIds).not.toContain("old-page");
  });

  it("clears only the recovered account's page error", async () => {
    const attempts = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = new URL(input, "http://localhost");
        const id = url.searchParams.get("accountId")!;
        if (!url.searchParams.has("pageToken")) {
          return Promise.resolve(
            response({ threads: [thread(id, `${id}-first`)], nextPageToken: "next" }),
          );
        }
        const count = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, count);
        if (count === 1 || (id === "second" && count === 2)) {
          return Promise.resolve(response({ error: "temporary" }, 503));
        }
        return Promise.resolve(response({ threads: [thread(id, `${id}-last`)] }));
      }),
    );
    const { threadsStore, result } = setup();
    await waitFor(() => expect(threadsStore.getState().isLoading).toBe(false));
    await act(async () => result.current.fetchMore());
    expect(threadsStore.getState().failedAccountIds).toEqual(["first", "second"]);
    expect(threadsStore.getState().visibleThreadIds).toHaveLength(2);
    await act(async () => result.current.fetchMore());
    expect(threadsStore.getState().failedAccountIds).toEqual(["second"]);
    expect(threadsStore.getState().visibleThreadIds).toContain("first-last");
    await act(async () => result.current.fetchMore());
    expect(threadsStore.getState().failedAccountIds).toEqual([]);
    expect(threadsStore.getState().visibleThreadIds).toContain("second-last");
  });
});
