import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Sidebar } from "../sidebar";
import { StoreContext, createStores, createStoresWithData } from "../../hooks/use-store";
import type { Account } from "@vantagemail/core";

afterEach(cleanup);

const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-1",
    email: "alice@gmail.com",
    displayName: "Alice",
    color: "#228be6",
    unreadCount: 3,
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

function renderSidebar(options?: { accounts?: Account[]; onAddAccount?: () => void }) {
  const stores = options?.accounts?.length
    ? createStoresWithData(options.accounts, [])
    : createStores();

  return render(
    <StoreContext.Provider value={stores}>
      <Sidebar onAddAccount={options?.onAddAccount} />
    </StoreContext.Provider>,
  );
}

describe("Sidebar", () => {
  // 「+ アカウントを追加」ボタンは設定画面に集約したため、サイドバーのテストからは削除

  it("接続済みアカウントが表示される", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob (Work)")).toBeInTheDocument();
  });

  it("未読数が0より大きいアカウントにバッジが表示される", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    // Alice: 3件 → "3" が表示される
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    // Bob: 0件 → バッジなし
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("Smart Inboxカテゴリが表示される", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    expect(screen.getByText("Smart Inbox")).toBeInTheDocument();
    expect(screen.getByText("すべて")).toBeInTheDocument();
    expect(screen.getByText("重要")).toBeInTheDocument();
    expect(screen.getByText("通知")).toBeInTheDocument();
    expect(screen.getByText("ニュースレター")).toBeInTheDocument();
  });

  it("「すべてのアカウント」がデフォルトで選択状態", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    const unifiedButton = screen.getByText("すべてのアカウント").closest("button");
    expect(unifiedButton?.className).toContain("bg-[var(--color-bg-selected)]");
  });

  it("アカウントをクリックするとそのアカウントが選択状態になる", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    fireEvent.click(screen.getByText("Alice"));

    const aliceButton = screen.getByText("Alice").closest("button");
    expect(aliceButton?.className).toContain("bg-[var(--color-bg-selected)]");

    const unifiedButton = screen.getByText("すべてのアカウント").closest("button");
    expect(unifiedButton?.className).not.toContain("bg-[var(--color-bg-selected)]");
  });

  it("「すべてのアカウント」をクリックすると全アカウント表示に戻る", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    // まず Alice を選択
    fireEvent.click(screen.getByText("Alice"));
    // すべてのアカウントに戻す
    fireEvent.click(screen.getByText("すべてのアカウント"));

    const unifiedButton = screen.getByText("すべてのアカウント").closest("button");
    expect(unifiedButton?.className).toContain("bg-[var(--color-bg-selected)]");
  });
});
