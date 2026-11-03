// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAccountsStore, createThreadsStore } from "@vantagemail/core";
import type { Account, Thread } from "@vantagemail/core";
import { StoreContext } from "../../hooks/use-store";
import { ThreadList } from "../thread-list";

const accounts: Account[] = ["first", "second"].map((id) => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  color: "#333333",
  unreadCount: 0,
  notificationsEnabled: true,
}));
const makeThread = (accountId: string): Thread => ({
  id: `${accountId}-thread`,
  accountId,
  subject: `${accountId} message`,
  snippet: "fixture",
  lastMessageAt: new Date("2026-01-01"),
  participants: ["fixture@example.test"],
  messageCount: 1,
  labelIds: ["INBOX", "CATEGORY_PERSONAL"],
  isUnread: true,
  isStarred: false,
  isPinned: false,
});
afterEach(cleanup);

describe("ThreadList search and recovery", () => {
  it("keeps search available for empty, loading and failed lists; supports account filter and retries", async () => {
    const accountsStore = createAccountsStore(accounts);
    const threadsStore = createThreadsStore();
    const state = threadsStore.getState();
    state.setThreads("first", [makeThread("first")]);
    state.setThreads("second", [makeThread("second")]);
    render(
      <StoreContext.Provider value={{ accountsStore, threadsStore }}>
        <ThreadList />
      </StoreContext.Provider>,
    );
    expect(screen.getByText("first message")).not.toBeNull();
    expect(screen.getByText("second message")).not.toBeNull();
    act(() => threadsStore.getState().setActiveAccountId("second"));
    expect(screen.queryByText("first message")).toBeNull();
    expect(screen.getByText("second message")).not.toBeNull();
    act(() => threadsStore.getState().setActiveAccountId(null));

    fireEvent.change(screen.getByPlaceholderText("メールを検索..."), {
      target: { value: "subject:fixture" },
    });
    await waitFor(() => expect(threadsStore.getState().searchQuery).toBe("subject:fixture"));
    expect(screen.getByText("読み込み中...")).not.toBeNull();
    act(() => {
      threadsStore.getState().setThreads("first", [{ ...makeThread("first"), labelIds: ["SENT"] }]);
      threadsStore.getState().setLoading(false);
    });
    expect(screen.getByText("first message")).not.toBeNull();
    act(() => {
      threadsStore.getState().setThreads("first", []);
      threadsStore.getState().setFailedAccountIds(["first"]);
    });
    expect(screen.getByRole("alert").textContent).toContain("一部");
    fireEvent.click(screen.getByText("再試行"));
    expect(threadsStore.getState().refreshVersion).toBe(1);
    act(() => threadsStore.getState().setFailedAccountIds([]));
    expect(screen.getByText("検索結果はありません")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("検索をクリア"));
    expect(threadsStore.getState().searchQuery).toBe("");
    expect(screen.getByPlaceholderText("メールを検索...")).not.toBeNull();
    act(() => threadsStore.getState().setLoading(false));
    fireEvent.click(screen.getByLabelText("メール一覧を更新"));
    expect(threadsStore.getState().refreshVersion).toBe(2);
  });
});
