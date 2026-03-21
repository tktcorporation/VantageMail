/**
 * アプリの3カラムレイアウト（モバイルレスポンシブ対応）。
 *
 * 背景: メールクライアントの標準的なレイアウトパターン。
 * デスクトップ: サイドバー | スレッドリスト | スレッド詳細 の3ペイン構成。
 * モバイル（< 768px）: 1画面ずつ表示し、画面切り替え式で遷移する。
 * サイドバーはモバイル時にオーバーレイメニューとして表示。
 */
import type { ReactNode } from "react";

/** モバイル時に表示するペイン */
export type MobileView = "list" | "detail";

interface AppLayoutProps {
  sidebar: ReactNode;
  threadList: ReactNode;
  threadView: ReactNode;
  /** モバイル時の表示ペイン。デスクトップでは無視される。 */
  mobileView?: MobileView;
  /** モバイルサイドバーの開閉状態 */
  isSidebarOpen?: boolean;
  /** モバイルサイドバーを閉じるコールバック */
  onCloseSidebar?: () => void;
}

export function AppLayout({
  sidebar,
  threadList,
  threadView,
  mobileView = "list",
  isSidebarOpen = false,
  onCloseSidebar,
}: AppLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden relative">
      {/* --- デスクトップ: 常時表示のサイドバー / モバイル: 非表示 --- */}
      <aside className="hidden md:flex w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] border-r border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] flex-col overflow-hidden">
        {sidebar}
      </aside>

      {/* --- モバイル: オーバーレイサイドバー --- */}
      {isSidebarOpen && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="md:hidden fixed inset-0 bg-black/30 z-40"
            onClick={onCloseSidebar}
            onKeyDown={(e) => { if (e.key === "Escape") onCloseSidebar?.(); }}
            role="presentation"
          />
          {/* サイドバー本体 */}
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[280px] bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-light)] flex flex-col overflow-hidden z-50 shadow-xl">
            {sidebar}
          </aside>
        </>
      )}

      {/* --- スレッドリスト --- */}
      <div className={`${
        mobileView === "list" ? "flex" : "hidden"
      } md:flex w-full md:w-[var(--thread-list-width)] md:min-w-[var(--thread-list-width)] border-r border-[var(--color-border-light)] flex-col overflow-hidden`}>
        {threadList}
      </div>

      {/* --- スレッド詳細 / 設定 --- */}
      <main className={`${
        mobileView === "detail" ? "flex" : "hidden"
      } md:flex flex-1 flex-col overflow-hidden`}>
        {threadView}
      </main>
    </div>
  );
}
