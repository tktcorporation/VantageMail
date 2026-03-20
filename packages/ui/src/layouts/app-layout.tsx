/**
 * アプリの3カラムレイアウト。
 *
 * 背景: メールクライアントの標準的なレイアウトパターン。
 * サイドバー（アカウント・ラベル） | スレッドリスト | スレッド詳細
 * Sparkや Superhumanと同様の3ペイン構成（spec §5.2）。
 */
import type { ReactNode } from "react";

interface AppLayoutProps {
  sidebar: ReactNode;
  threadList: ReactNode;
  threadView: ReactNode;
}

export function AppLayout({ sidebar, threadList, threadView }: AppLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          width: "var(--sidebar-width)",
          minWidth: "var(--sidebar-width)",
          borderRight: "1px solid var(--color-border-light)",
          background: "var(--color-bg-secondary)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {sidebar}
      </aside>
      <div
        style={{
          width: "var(--thread-list-width)",
          minWidth: "var(--thread-list-width)",
          borderRight: "1px solid var(--color-border-light)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {threadList}
      </div>
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {threadView}
      </main>
    </div>
  );
}
