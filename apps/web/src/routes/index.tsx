/**
 * メインルート（/）— VantageMail のメール UI。
 *
 * 背景: TanStack Start のファイルベースルーティングにより、
 * このファイルが / パスに自動マッピングされる。
 *
 * loader でサーバーサイドの暗号化セッションからアカウント一覧を取得し、
 * クライアントに渡す。トークンはサーバー側に残り、クライアントには
 * 表示用の Account 情報のみが届く。
 */
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "@tanstack/react-start/server";
import type { Account } from "@vantagemail/core";
import {
  getSessionConfig,
  type AppSessionData,
  type StoredAccount,
} from "~/lib/session";
import { AppShell } from "~/components/app-shell";

/**
 * セッションからアカウント一覧を取得するサーバー関数。
 * トークンは除外し、表示用の Account のみ返す。
 */
const getAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Account[]> => {
    const session = await getSession<AppSessionData>(getSessionConfig());
    const stored: StoredAccount[] = session.data.accounts ?? [];
    return stored.map((sa) => sa.account);
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
