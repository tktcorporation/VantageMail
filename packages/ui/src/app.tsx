/**
 * VantageMail ルートAppコンポーネント。
 *
 * 背景: ストアの初期化、レイアウトの組み立て、グローバルキーボードイベントの
 * セットアップを行うアプリのエントリーポイント。
 * デスクトップ/Web両方で同一のコンポーネントを使う（95%コード共有）。
 *
 * showSettings が true のとき、右ペインに AccountSettings を表示する。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { match, P } from "ts-pattern";
import type { Account } from "@vantagemail/core";
import { StoreContext, createStores, useStoreApis } from "./hooks/use-store";
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts";
import { useSync } from "./hooks/use-sync";
import { AppLayout, type MobileView } from "./layouts/app-layout";
import { Sidebar } from "./components/sidebar";
import { ThreadList } from "./components/thread-list";
import { ThreadView } from "./components/thread-view";
import { AccountSettings } from "./components/account-settings";
import { CommandPalette } from "./components/command-palette";
import { Onboarding } from "./components/onboarding";
import { AuthExpiredBanner } from "./components/auth-expired-banner";
import { useAccounts, useThreads } from "./hooks/use-store";

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
function InnerAppShell({
  onStartAuth,
  onRemoveAccount,
}: {
  onStartAuth?: () => void;
  /**
   * 外部 (AppShell) と同じ Promise<void> 契約を保つ。
   * ローカルで `void` に narrow すると、Promise チェーンの `.then().catch()` が
   * `void` 型に対する違法操作として型エラーになるのを bivariant 扱いで
   * 見逃してしまうため。
   */
  onRemoveAccount?: (accountId: string) => Promise<void>;
}) {
  const { threadsStore, accountsStore } = useStoreApis();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const accounts = useAccounts((s) => s.accounts);
  const selectedThreadId = useThreads((s) => s.selectedThreadId);

  // スレッド選択時にモバイルでは詳細画面に自動遷移
  useEffect(() => {
    if (selectedThreadId) {
      setMobileView("detail");
    }
  }, [selectedThreadId]);

  useKeyboardShortcuts({ threadsStore });
  // Mount 時に全アカウントのスレッドを Gmail API から取得
  const { fetchMore } = useSync({ accountsStore, threadsStore });

  const handleAddAccount = useCallback(() => {
    if (onStartAuth) {
      onStartAuth();
    } else {
      console.warn("onStartAuth が未設定です。apps/web/src/main.tsx で設定してください。");
    }
  }, [onStartAuth]);

  const handleRemoveAccount = useCallback(
    (accountId: string) => {
      // onRemoveAccount は AppProps で optional として公開されているため、未指定
      // での呼び出しは合法的な使用パターン (例: packages/ui/e2e/dev-entry.tsx は
      // この prop を渡さずに <App /> を描画する)。throw すると React の Error
      // Boundary はイベントハンドラ内例外を捕捉しないため UI ハードフェイルになる。
      // 旧実装の `?? Promise.resolve()` で `accountsStore.removeAccount` を呼ぶ
      // のは「サーバー連携なしで UI からアカウント削除」という潜在バグだったので、
      // ここでは silent no-op に留めて開発者が気付けるよう console.warn のみ出す。
      //
      // 本来の解決は「onRemoveAccount が無い場合は削除アクション (Sidebar /
      // AccountSettings の削除ボタン) を非表示にする」UI レベルの対応で、
      // 別 PR で扱う。
      if (!onRemoveAccount) {
        console.warn(
          "onRemoveAccount が未設定です。AppShell から注入してください (例: apps/web/src/main.tsx)。",
        );
        return;
      }

      // サーバーサイドのセッションから先に削除し、成功後にストアを更新する。
      // 楽観的更新だとサーバー失敗時にリロードでアカウントが復活する問題を防ぐ。
      //
      // packages/ui を Effect-TS 非依存に保つため、try/catch ではなく Promise
      // チェーンで分岐する（apps/web 側は AppShell で Effect 化済み）。
      // ui に Effect を持ち込みたくなったら useRuntime() で移行できる。
      //
      // .then 内の zustand `removeAccount` action は通常 throw しないが、
      // 万一同期 throw した場合は .catch に流れて「アカウント削除失敗」と表示される。
      // 実際にはサーバー側削除は成功しているため文言が誤誘導になる可能性がある。
      // 現状は zustand action 失敗をレアケースとして許容、将来 store action を
      // Result 型化するなら別ハンドリングを導入する。
      void onRemoveAccount(accountId)
        .then(() => {
          accountsStore.getState().removeAccount(accountId);
        })
        .catch((err: unknown) => {
          // 原因 (TaggedError / fetch reject の cause / defect の Cause 文字列等) を
          // 必ずログに残す。下流で `_tag` 別の UX 分岐を行うため、ここで詳細展開する。
          console.error("Account removal failed:", err);
          // ts-pattern で `_tag` / `status` 別に UX 文言を分岐。
          //   - Network: 接続確認
          //   - Http 401/403: 再ログイン導線
          //   - Http 5xx: サーバー混雑案内 (再試行で復帰しうる)
          //   - Http 4xx (上記以外): 状況表示 (再試行しても無駄なケース)
          //   - Defect (想定外): 「予期しないエラー」と明示してサポート誘導
          //   - その他: 汎用 (一般的失敗)
          //
          // 注意: ts-pattern は構造マッチで `_tag`/`status` のみ narrow する。
          // callback 内で `e.cause` 等の非マッチフィールドを参照するには、
          // パターンに `cause: P.any` を含めて narrow を拡げる必要がある。
          // 現状は `_tag`/`status` のみ参照なので問題ない。
          const message = match(err)
            .with(
              { _tag: "AccountRemoveNetworkError" },
              () => "ネットワークエラー: 接続を確認して再試行してください。",
            )
            .with(
              { _tag: "AccountRemoveHttpError", status: P.union(401, 403) },
              () => "セッションが切れました。再ログインしてください。",
            )
            .with(
              {
                _tag: "AccountRemoveHttpError",
                // type predicate で number narrow しつつ 5xx をマッチ。
                // P.when の引数は `unknown` に広いため、`s is number` で絞り込む。
                status: P.when((s): s is number => typeof s === "number" && s >= 500),
              },
              ({ status }) =>
                `サーバーが混み合っています (HTTP ${status})。少し待ってからお試しください。`,
            )
            .with(
              { _tag: "AccountRemoveHttpError", status: P.number },
              ({ status }) => `アカウント削除に失敗しました (HTTP ${status})。`,
            )
            .with(
              { _tag: "AccountRemoveDefect" },
              () => "予期しないエラーが発生しました。問題が続く場合はサポートにご連絡ください。",
            )
            .otherwise(
              () => "予期しないエラーが発生しました。問題が続く場合はサポートにご連絡ください。",
            );
          alert(message);
        });
    },
    [accountsStore, onRemoveAccount],
  );

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
    // モバイルで設定を開くときは詳細ペインに切り替え
    setMobileView("detail");
  }, []);

  /** モバイルで詳細画面からリストに戻る */
  const handleMobileBack = useCallback(() => {
    setMobileView("list");
    threadsStore.getState().selectThread(null);
    setShowSettings(false);
  }, [threadsStore]);

  const handleOpenSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), []);

  // アカウント未登録時はオンボーディング画面を表示
  if (accounts.length === 0) {
    return <Onboarding onStartAuth={handleAddAccount} />;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/*
          認証が切れたアカウントがあれば上部にバナーを表示し、
          ユーザーが再ログインへ進めるようにする。
          対象アカウントがなければ何もレンダーしない（null を返す）。
        */}
        <AuthExpiredBanner onReauth={handleAddAccount} />
        <div className="flex-1 min-h-0">
          <AppLayout
            mobileView={mobileView}
            isSidebarOpen={isSidebarOpen}
            onCloseSidebar={handleCloseSidebar}
            sidebar={
              <Sidebar
                onAddAccount={handleAddAccount}
                onRemoveAccount={handleRemoveAccount}
                onToggleSettings={() => {
                  handleToggleSettings();
                  handleCloseSidebar();
                }}
                isSettingsActive={showSettings}
              />
            }
            threadList={<ThreadList onOpenSidebar={handleOpenSidebar} onFetchMore={fetchMore} />}
            threadView={
              showSettings ? (
                <AccountSettings
                  onAddAccount={handleAddAccount}
                  onRemoveAccount={handleRemoveAccount}
                  onBack={handleMobileBack}
                />
              ) : (
                <ThreadView onBack={handleMobileBack} />
              )
            }
          />
        </div>
      </div>
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
