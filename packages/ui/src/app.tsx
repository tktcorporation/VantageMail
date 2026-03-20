/**
 * VantageMail ルートAppコンポーネント。
 *
 * 背景: ストアの初期化、レイアウトの組み立て、グローバルキーボードイベントの
 * セットアップを行うアプリのエントリーポイント。
 * デスクトップ/Web両方で同一のコンポーネントを使う（95%コード共有）。
 */
import { useCallback, useMemo } from "react";
import { StoreContext, createStores, useStoreApis } from "./hooks/use-store";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { AppLayout } from "./layouts/app-layout";
import { Sidebar } from "./components/sidebar";
import { ThreadList } from "./components/thread-list";
import { ThreadView } from "./components/thread-view";
import { CommandPalette } from "./components/command-palette";

export interface AppProps {
  /**
   * OAuth 認証フローを開始するコールバック。
   * プラットフォームごとに異なる実装を注入する（Web: useOAuth, Desktop: Electrobun IPC）。
   * 未指定の場合、アカウント追加ボタンは何もしない。
   */
  onStartAuth?: () => void;
}

/**
 * アプリの内部シェル。StoreContext.Provider の内側に配置し、
 * ストアへのアクセスが必要なフック（キーボードショートカット等）を接続する。
 */
function AppShell({ onStartAuth }: { onStartAuth?: () => void }) {
  const { threadsStore } = useStoreApis();

  useKeyboardShortcuts({ threadsStore });

  const handleAddAccount = useCallback(() => {
    if (onStartAuth) {
      onStartAuth();
    } else {
      console.warn("onStartAuth が未設定です。apps/web/src/main.tsx で設定してください。");
    }
  }, [onStartAuth]);

  return (
    <>
      <AppLayout
        sidebar={<Sidebar onAddAccount={handleAddAccount} />}
        threadList={<ThreadList />}
        threadView={<ThreadView />}
      />
      <CommandPalette />
    </>
  );
}

export function App({ onStartAuth }: AppProps = {}) {
  const stores = useMemo(() => createStores(), []);

  return (
    <StoreContext.Provider value={stores}>
      <AppShell onStartAuth={onStartAuth} />
    </StoreContext.Provider>
  );
}
