/**
 * ログアウト API（POST /api/auth/logout）。
 *
 * 背景: セッションをクリアしてログアウトする。
 * D1 のユーザーデータやアカウントデータは削除しない（次回ログイン時に復元するため）。
 * セッションの DEK が消えることで、D1 のデータにアクセスできなくなる。
 */
import { createFileRoute } from "@tanstack/react-router";
import { updateSession } from "@tanstack/react-start/server";
import { getSessionConfig, type AppSessionData } from "~/lib/session";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        // セッションを空にする（Cookie は残るが中身が空になる）
        await updateSession<AppSessionData>(getSessionConfig(), () => ({
          userId: undefined,
          dek: undefined,
          codeVerifier: undefined,
          accessTokenCache: undefined,
        }));

        return Response.json({ ok: true });
      },
    },
  },
});
