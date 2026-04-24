import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuthExpiredBanner } from "../auth-expired-banner";
import { StoreContext, createStoresWithData } from "../../hooks/use-store";
import type { Account } from "@vantagemail/core";

afterEach(cleanup);

const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-1",
    email: "alice@gmail.com",
    displayName: "Alice",
    color: "#228be6",
    unreadCount: 0,
    notificationsEnabled: true,
  },
  {
    id: "acc-2",
    email: "bob@work.com",
    displayName: "Bob (Work)",
    color: "#40c057",
    unreadCount: 0,
    notificationsEnabled: true,
  },
];

function renderBanner(options?: { expiredAccountIds?: string[]; onReauth?: () => void }) {
  const stores = createStoresWithData(MOCK_ACCOUNTS, []);
  // 指定されたアカウントを期限切れ状態にする（use-sync.ts が本番で行う更新を模倣）
  for (const id of options?.expiredAccountIds ?? []) {
    stores.accountsStore.getState().setConnectionStatus(id, "token_expired");
  }

  return render(
    <StoreContext.Provider value={stores}>
      <AuthExpiredBanner onReauth={options?.onReauth ?? (() => {})} />
    </StoreContext.Provider>,
  );
}

describe("AuthExpiredBanner", () => {
  it("期限切れアカウントがない場合は何も表示しない", () => {
    renderBanner({ expiredAccountIds: [] });
    expect(screen.queryByTestId("auth-expired-banner")).not.toBeInTheDocument();
  });

  it("connectionStatus が token_expired のアカウントをバナーに表示する", () => {
    renderBanner({ expiredAccountIds: ["acc-1"] });

    expect(screen.getByTestId("auth-expired-banner")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // Bob は期限切れではないので表示されない
    expect(screen.queryByText("Bob (Work)")).not.toBeInTheDocument();
  });

  it("複数アカウントが期限切れの場合、全て表示する", () => {
    renderBanner({ expiredAccountIds: ["acc-1", "acc-2"] });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob (Work)")).toBeInTheDocument();
    // 「再ログイン」ボタンもアカウント数ぶん並ぶ
    expect(screen.getAllByRole("button", { name: "再ログイン" })).toHaveLength(2);
  });

  it("再ログインボタンで onReauth が呼ばれる", () => {
    const onReauth = vi.fn();
    renderBanner({ expiredAccountIds: ["acc-1"], onReauth });

    fireEvent.click(screen.getByRole("button", { name: "再ログイン" }));
    expect(onReauth).toHaveBeenCalledTimes(1);
  });
});
