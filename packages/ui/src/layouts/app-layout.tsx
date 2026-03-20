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
    <div className="flex h-full overflow-hidden">
      <aside className="w-[var(--sidebar-width)] min-w-[var(--sidebar-width)] border-r border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden">
        {sidebar}
      </aside>
      <div className="w-[var(--thread-list-width)] min-w-[var(--thread-list-width)] border-r border-[var(--color-border-light)] flex flex-col overflow-hidden">
        {threadList}
      </div>
      <main className="flex-1 flex flex-col overflow-hidden">
        {threadView}
      </main>
    </div>
  );
}
