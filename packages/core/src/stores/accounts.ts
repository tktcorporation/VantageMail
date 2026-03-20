/**
 * アカウント状態のストア。
 *
 * 背景: マルチアカウント管理のグローバル状態。zustandを使い、
 * React外（Gmail APIクライアント等）からもアクセス可能にする。
 * アカウントの追加・削除にアプリ再起動が不要（spec §5.1）。
 */
import { createStore } from "zustand/vanilla";
import type { Account, AccountConnectionStatus } from "../types/account";

export interface AccountsState {
  accounts: Account[];
  /** 現在アクティブなアカウントID。nullの場合はUnified Inbox（全アカウント表示） */
  activeAccountId: string | null;
  connectionStatuses: Record<string, AccountConnectionStatus>;
}

export interface AccountsActions {
  addAccount: (account: Account) => void;
  removeAccount: (accountId: string) => void;
  setActiveAccount: (accountId: string | null) => void;
  updateUnreadCount: (accountId: string, count: number) => void;
  setConnectionStatus: (
    accountId: string,
    status: AccountConnectionStatus,
  ) => void;
}

export type AccountsStore = AccountsState & AccountsActions;

export const createAccountsStore = (
  initialAccounts: Account[] = [],
) =>
  createStore<AccountsStore>((set) => ({
    accounts: initialAccounts,
    activeAccountId: null,
    connectionStatuses: Object.fromEntries(
      initialAccounts.map((a) => [a.id, "connected" as const]),
    ),

    addAccount: (account) =>
      set((state) => ({
        accounts: [...state.accounts, account],
        connectionStatuses: {
          ...state.connectionStatuses,
          [account.id]: "connected",
        },
      })),

    removeAccount: (accountId) =>
      set((state) => {
        const { [accountId]: _, ...rest } = state.connectionStatuses;
        return {
          accounts: state.accounts.filter((a) => a.id !== accountId),
          connectionStatuses: rest,
          activeAccountId:
            state.activeAccountId === accountId
              ? null
              : state.activeAccountId,
        };
      }),

    setActiveAccount: (accountId) =>
      set({ activeAccountId: accountId }),

    updateUnreadCount: (accountId, count) =>
      set((state) => ({
        accounts: state.accounts.map((a) =>
          a.id === accountId ? { ...a, unreadCount: count } : a,
        ),
      })),

    setConnectionStatus: (accountId, status) =>
      set((state) => ({
        connectionStatuses: {
          ...state.connectionStatuses,
          [accountId]: status,
        },
      })),
  }));
