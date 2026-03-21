/**
 * アカウント一覧 API（GET /api/accounts）・アカウント削除 API（DELETE /api/accounts）。
 *
 * 背景: D1 に保存された linked_accounts からアカウント情報を取得・操作する。
 * クライアントにはトークンを含まない Account 情報のみ返す。
 * セッションの userId で認証済みかを判定する。
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSession, updateSession } from "@tanstack/react-start/server";
import type { Account } from "@vantagemail/core";
import {
  getSessionConfig,
  type AppSessionData,
} from "~/lib/session";
import {
  getDB,
  findLinkedAccountsByUserId,
  deleteLinkedAccount,
  type LinkedAccountRow,
} from "~/lib/db";

/** D1 の LinkedAccountRow を クライアント向け Account 型に変換する */
function toAccount(row: LinkedAccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    color: row.color,
    unreadCount: 0,
    notificationsEnabled: true,
  };
}

export const Route = createFileRoute("/api/accounts/")({
  server: {
    handlers: {
      /** 連携済みアカウント一覧を返す（トークンは含まない） */
      GET: async () => {
        const session = await getSession<AppSessionData>(getSessionConfig());
        const userId = session.data.userId;
        if (!userId) {
          return Response.json({ accounts: [] });
        }

        const db = await getDB();
        const rows = await findLinkedAccountsByUserId(db, userId);
        const accounts: Account[] = rows.map(toAccount);
        return Response.json({ accounts });
      },

      /** 指定IDのアカウントを削除する */
      DELETE: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { accountId?: string } | null;
        const accountId = body?.accountId;
        if (!accountId || typeof accountId !== "string") {
          return Response.json(
            { error: "accountId is required" },
            { status: 400 },
          );
        }

        const session = await getSession<AppSessionData>(getSessionConfig());
        const userId = session.data.userId;
        if (!userId) {
          return Response.json({ error: "not authenticated" }, { status: 401 });
        }

        const db = await getDB();
        const deleted = await deleteLinkedAccount(db, userId, accountId);
        if (!deleted) {
          return Response.json(
            { error: "account not found" },
            { status: 404 },
          );
        }

        // セッションの access_token キャッシュからも削除
        await updateSession<AppSessionData>(getSessionConfig(), (prev) => {
          const cache = { ...prev.accessTokenCache };
          delete cache[accountId];
          return { ...prev, accessTokenCache: cache };
        });

        return Response.json({ ok: true });
      },
    },
  },
});
