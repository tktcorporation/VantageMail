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

function renderSidebar(options?: {
  accounts?: Account[];
  onAddAccount?: () => void;
}) {
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
  it("アカウント未接続時に「アカウントを追加」ボタンが表示される", () => {
    renderSidebar();
    expect(screen.getByText("+ アカウントを追加")).toBeInTheDocument();
  });

  it("「アカウントを追加」ボタンをクリックすると onAddAccount が呼ばれる", () => {
    const onAddAccount = vi.fn();
    renderSidebar({ onAddAccount });

    fireEvent.click(screen.getByText("+ アカウントを追加"));
    expect(onAddAccount).toHaveBeenCalledTimes(1);
  });

  it("接続済みアカウントが表示される", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob (Work)")).toBeInTheDocument();
  });

  it("未読数が0より大きいアカウントにバッジが表示される", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    // Alice: 3件、Unified Inbox: 合計3件 → "3" が2つ
    expect(screen.getAllByText("3")).toHaveLength(2);
    // Bob: 0件 → バッジなし
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("Unified Inbox がデフォルトで選択状態", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    const unifiedButton = screen.getByText("すべての受信トレイ").closest("button");
    expect(unifiedButton?.className).toContain("bg-[var(--color-bg-selected)]");
  });

  it("アカウントをクリックするとそのアカウントが選択状態になる", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    fireEvent.click(screen.getByText("Alice"));

    const aliceButton = screen.getByText("Alice").closest("button");
    expect(aliceButton?.className).toContain("bg-[var(--color-bg-selected)]");

    const unifiedButton = screen.getByText("すべての受信トレイ").closest("button");
    expect(unifiedButton?.className).not.toContain("bg-[var(--color-bg-selected)]");
  });

  it("Unified Inbox をクリックすると全アカウント表示に戻る", () => {
    renderSidebar({ accounts: MOCK_ACCOUNTS });

    // まず Alice を選択
    fireEvent.click(screen.getByText("Alice"));
    // Unified Inbox に戻す
    fireEvent.click(screen.getByText("すべての受信トレイ"));

    const unifiedButton = screen.getByText("すべての受信トレイ").closest("button");
    expect(unifiedButton?.className).toContain("bg-[var(--color-bg-selected)]");
  });
});
