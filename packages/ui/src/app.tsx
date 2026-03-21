/**
 * VantageMail ルートAppコンポーネント。
 *
 * 背景: ストアの初期化、レイアウトの組み立て、グローバルキーボードイベントの
 * セットアップを行うアプリのエントリーポイント。
 * デスクトップ/Web両方で同一のコンポーネントを使う（95%コード共有）。
 *
 * showSettings が true のとき、右ペインに AccountSettings を表示する。
 */
import { useCallback, useMemo, useState } from "react";
import type { Account } from "@vantagemail/core";
import { StoreContext, createStores, useStoreApis } from "./hooks/use-store";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { useSync } from "./hooks/use-sync";
import { AppLayout } from "./layouts/app-layout";
import { Sidebar } from "./components/sidebar";
import { ThreadList } from "./components/thread-list";
import { ThreadView } from "./components/thread-view";
import { AccountSettings } from "./components/account-settings";
import { CommandPalette } from "./components/command-palette";
import { Onboarding } from "./components/onboarding";
import { useAccounts } from "./hooks/use-store";

export interface AppProps {
  /**
   * OAuth 認証フローを開始するコールバック。
   * プラットフォームごとに異なる実装を注入する（Web: サーバー経由, Desktop: Electrobun IPC）。
   * 未指定の場合、アカウント追加ボタンは何もしない。
   */
  onStartAuth?: () => void;
  /**
   * アカウント連携を解除するコールバック。
   * 成功時に resolve、失敗時に reject する Promise を返すこと。
   * Web版: サーバーのセッションからアカウントを削除。
   * Desktop版: OSキーチェーンからトークンを削除。
   */
  onRemoveAccount?: (accountId: string) => Promise<void>;
  /**
   * サーバーサイドのセッションから復元された初期アカウント一覧。
   * SSR時にloaderから渡され、ストアの初期値として使われる。
   */
  initialAccounts?: Account[];
}

/**
 * アプリの内部シェル。StoreContext.Provider の内側に配置し、
 * ストアへのアクセスが必要なフック（キーボードショートカット等）を接続する。
 */
function InnerAppShell({ onStartAuth, onRemoveAccount }: {
  onStartAuth?: () => void;
  onRemoveAccount?: (accountId: string) => void;
}) {
  const { threadsStore, accountsStore } = useStoreApis();
  const [showSettings, setShowSettings] = useState(false);
  const accounts = useAccounts((s) => s.accounts);

  useKeyboardShortcuts({ threadsStore });
  // Mount 時に全アカウントのスレッドを Gmail API から取得
  useSync({ accountsStore, threadsStore });

  const handleAddAccount = useCallback(() => {
    if (onStartAuth) {
      onStartAuth();
    } else {
      console.warn("onStartAuth が未設定です。apps/web/src/main.tsx で設定してください。");
    }
  }, [onStartAuth]);

  const handleRemoveAccount = useCallback(async (accountId: string) => {
    // サーバーサイドのセッションから先に削除し、成功後にストアを更新。
    // 楽観的更新だとサーバー失敗時にリロードでアカウントが復活する問題を防ぐ。
    try {
      await onRemoveAccount?.(accountId);
      accountsStore.getState().removeAccount(accountId);
    } catch {
      // サーバー失敗時はストアを変更しない（UIに反映されない）
      alert("Failed to remove account. Please try again.");
    }
  }, [accountsStore, onRemoveAccount]);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  // アカウント未登録時はオンボーディング画面を表示
  if (accounts.length === 0) {
    return <Onboarding onStartAuth={handleAddAccount} />;
  }

  return (
    <>
      <AppLayout
        sidebar={
          <Sidebar
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onToggleSettings={handleToggleSettings}
            isSettingsActive={showSettings}
          />
        }
        threadList={<ThreadList />}
        threadView={
          showSettings ? (
            <AccountSettings
              onAddAccount={handleAddAccount}
              onRemoveAccount={handleRemoveAccount}
            />
          ) : (
            <ThreadView />
          )
        }
      />
      <CommandPalette />
    </>
  );
}

export function App({ onStartAuth, onRemoveAccount, initialAccounts }: AppProps = {}) {
  const stores = useMemo(() => createStores(initialAccounts), []);

  return (
    <StoreContext.Provider value={stores}>
      <InnerAppShell onStartAuth={onStartAuth} onRemoveAccount={onRemoveAccount} />
    </StoreContext.Provider>
  );
}
