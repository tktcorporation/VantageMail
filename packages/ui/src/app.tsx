/**
 * VantageMail ルートAppコンポーネント。
 *
 * 背景: ストアの初期化、レイアウトの組み立て、グローバルキーボードイベントの
 * セットアップを行うアプリのエントリーポイント。
 * デスクトップ/Web両方で同一のコンポーネントを使う（95%コード共有）。
 */
import { useMemo } from "react";
import { StoreContext, createStoresWithData, useStoreApis } from "./hooks/use-store";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { AppLayout } from "./layouts/app-layout";
import { Sidebar } from "./components/sidebar";
import { ThreadList } from "./components/thread-list";
import { ThreadView } from "./components/thread-view";
import { CommandPalette } from "./components/command-palette";
import { MOCK_ACCOUNTS, MOCK_THREADS } from "./dev/mock-data";

/**
 * アプリの内部シェル。StoreContext.Provider の内側に配置し、
 * ストアへのアクセスが必要なフック（キーボードショートカット等）を接続する。
 */
function AppShell() {
  const { threadsStore } = useStoreApis();

  useKeyboardShortcuts({ threadsStore });

  return (
    <>
      <AppLayout
        sidebar={<Sidebar />}
        threadList={<ThreadList />}
        threadView={<ThreadView />}
      />
      <CommandPalette />
    </>
  );
}

export function App() {
  // TODO: Gmail API接続後にモックデータを実データに置き換える
  const stores = useMemo(
    () => createStoresWithData(MOCK_ACCOUNTS, MOCK_THREADS),
    [],
  );

  return (
    <StoreContext.Provider value={stores}>
      <AppShell />
    </StoreContext.Provider>
  );
}
