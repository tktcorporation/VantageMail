/**
 * メインルート（/）— VantageMail のメール UI。
 *
 * 背景: TanStack Start のファイルベースルーティングにより、
 * このファイルが / パスに自動マッピングされる。
 *
 * loader でサーバーサイドのセッションからユーザーID を取得し、
 * D1 からアカウント一覧を取得してクライアントに渡す。
 * トークンはサーバー側に残り、クライアントには表示用の Account 情報のみが届く。
 *
 * 未ログインの場合は空のアカウント一覧を返す（UI 側でログインボタンを表示）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "@tanstack/react-start/server";
import type { Account } from "@vantagemail/core";
import { getSessionConfig, type AppSessionData } from "~/lib/session";
import { getDB, findLinkedAccountsByUserIdLegacy as findLinkedAccountsByUserId, type LinkedAccountRow } from "~/lib/db";
import { AppShell } from "~/components/app-shell";

/**
 * セッションからユーザーIDを取得し、D1 からアカウント一覧を取得するサーバー関数。
 * トークンは除外し、表示用の Account のみ返す。
 */
const getAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Account[]> => {
    const session = await getSession<AppSessionData>(getSessionConfig());
    const userId = session.data.userId;
    if (!userId) return [];

    const db = await getDB();
    const rows = await findLinkedAccountsByUserId(db, userId);
    return rows.map((row: LinkedAccountRow) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? undefined,
      color: row.color,
      unreadCount: 0,
      notificationsEnabled: true,
    }));
  },
);

export const Route = createFileRoute("/")({
  loader: async () => {
    const accounts = await getAccounts();
    return { accounts };
  },
  component: IndexPage,
});

function IndexPage() {
  const { accounts } = Route.useLoaderData();
  return <AppShell initialAccounts={accounts} />;
}
