/**
 * ログアウト API（POST /api/auth/logout）。
 *
 * 背景: セッションをクリアしてログアウトする。
 * D1 のユーザーデータやアカウントデータは削除しない（次回ログイン時に復元するため）。
 * セッションの DEK が消えることで、D1 のデータにアクセスできなくなる。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { SessionService } from "~/lib/services/SessionService.ts";
import { getEnv, handleEffect } from "~/lib/runtime.ts";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        const env = await getEnv();

        const effect = Effect.gen(function* () {
          const session = yield* SessionService;
          // セッションを空にする（Cookie は残るが中身が空になる）
          yield* session.clear();
          return Response.json({ ok: true });
        });

        return handleEffect(effect, env);
      },
    },
  },
});
