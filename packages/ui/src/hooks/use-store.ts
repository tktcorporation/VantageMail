/**
 * zustand vanilla store をReactで使うためのフック群。
 *
 * 背景: @vantagemail/core のストアは zustand/vanilla で定義されており、
 * React以外の環境（Electrobunメインプロセス等）からも使える。
 * このフックでReactコンポーネントから使えるようにブリッジする。
 */
import { useStore } from "zustand";
import {
  createAccountsStore,
  type AccountsStore,
} from "@vantagemail/core";
import {
  createThreadsStore,
  type ThreadsStore,
} from "@vantagemail/core";
import { createContext, useContext } from "react";
import type { StoreApi } from "zustand";
import type { Account, Thread } from "@vantagemail/core";

/** ストアのインスタンスをReactツリーに注入するContext */
export interface StoreContextValue {
  accountsStore: StoreApi<AccountsStore>;
  threadsStore: StoreApi<ThreadsStore>;
}

export const StoreContext = createContext<StoreContextValue | null>(null);

function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("StoreContext.Provider が見つかりません。App をStoreProviderで囲んでください。");
  }
  return ctx;
}

export function useAccounts<T>(selector: (state: AccountsStore) => T): T {
  const { accountsStore } = useStoreContext();
  return useStore(accountsStore, selector);
}

export function useThreads<T>(selector: (state: ThreadsStore) => T): T {
  const { threadsStore } = useStoreContext();
  return useStore(threadsStore, selector);
}

/** ストアAPIインスタンスを直接取得する（フック外でのアクション呼び出し用） */
export function useStoreApis(): StoreContextValue {
  return useStoreContext();
}

/**
 * ストアインスタンスを生成するヘルパー。
 *
 * initialAccounts が渡された場合、ストアの初期値として設定する。
 * Web版ではサーバーのloaderがセッションからアカウント一覧を復元して渡す。
 * デスクトップ版ではOSキーチェーンから復元して渡す想定。
 */
export function createStores(initialAccounts?: Account[]): StoreContextValue {
  return {
    accountsStore: createAccountsStore(initialAccounts ?? []),
    threadsStore: createThreadsStore(),
  };
}

/**
 * 初期データ入りのストアを生成する。
 *
 * 背景: useEffectで初期化するとStrictModeの二重実行でデータが重複する。
 * ストア生成時に直接データを渡すことでこの問題を回避する。
 */
export function createStoresWithData(
  accounts: Account[],
  threads: Thread[],
): StoreContextValue {
  const accountsStore = createAccountsStore(accounts);
  const threadsStore = createThreadsStore();

  // アカウントごとにスレッドをグルーピングしてストアに設定
  const threadsByAccount = new Map<string, Thread[]>();
  for (const thread of threads) {
    const list = threadsByAccount.get(thread.accountId) ?? [];
    list.push(thread);
    threadsByAccount.set(thread.accountId, list);
  }
  for (const [accountId, accountThreads] of threadsByAccount) {
    threadsStore.getState().setThreads(accountId, accountThreads);
  }

  return { accountsStore, threadsStore };
}
