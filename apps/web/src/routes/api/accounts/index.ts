/**
 * アカウント一覧 API（GET /api/accounts）・アカウント削除 API（DELETE /api/accounts）。
 *
 * 背景: 暗号化セッションに保存されたアカウント情報を取得・操作する。
 * クライアントにはトークンを含まない Account 情報のみ返す。
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSession, updateSession } from "@tanstack/react-start/server";
import {
  getSessionConfig,
  type AppSessionData,
  type StoredAccount,
} from "~/lib/session";

export const Route = createFileRoute("/api/accounts/")({
  server: {
    handlers: {
      /** 連携済みアカウント一覧を返す（トークンは含まない） */
      GET: async () => {
        const session = await getSession<AppSessionData>(getSessionConfig());
        const storedAccounts: StoredAccount[] = session.data.accounts ?? [];
        // クライアントにはトークンを除いた Account のみ返す
        const accounts = storedAccounts.map((sa) => sa.account);
        return Response.json({ accounts });
      },

      /** 指定IDのアカウントをセッションから削除する */
      DELETE: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const accountId = body?.accountId;
        if (!accountId || typeof accountId !== "string") {
          return Response.json(
            { error: "accountId is required" },
            { status: 400 },
          );
        }

        const session = await getSession<AppSessionData>(getSessionConfig());
        const existing = session.data.accounts ?? [];
        const found = existing.some(
          (sa: StoredAccount) => sa.account.id === accountId,
        );

        if (!found) {
          return Response.json(
            { error: "account not found" },
            { status: 404 },
          );
        }

        await updateSession<AppSessionData>(getSessionConfig(), (prev) => {
          const accounts = (prev.accounts ?? []).filter(
            (sa: StoredAccount) => sa.account.id !== accountId,
          );
          return { ...prev, accounts };
        });

        return Response.json({ ok: true });
      },
    },
  },
});
