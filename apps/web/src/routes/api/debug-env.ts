/**
 * デバッグ用エンドポイント（一時的）。
 * env オブジェクトの内容を確認するためのもの。原因特定後に削除すること。
 */
import { createFileRoute } from "@tanstack/react-router"
import { getEnv } from "~/lib/runtime.ts"

export const Route = createFileRoute("/api/debug-env")({
  server: {
    handlers: {
      GET: async () => {
        const env = await getEnv()
        const envRecord = env as Record<string, unknown>

        const keys = [
          "GOOGLE_CLIENT_SECRET",
          "SERVER_SECRET",
          "SESSION_SECRET",
          "ALLOWED_ORIGINS",
          "DB",
        ]

        const result: Record<string, string> = {}
        for (const key of keys) {
          const val = envRecord[key]
          result[`env.${key}`] = val === undefined
            ? "undefined"
            : val === null
              ? "null"
              : `${typeof val}(len:${typeof val === "string" ? val.length : "N/A"})`

          const pval = process.env[key]
          result[`process.env.${key}`] = pval === undefined
            ? "undefined"
            : `string(len:${pval.length})`
        }

        result["env_keys"] = Object.keys(env).join(", ")

        return Response.json(result)
      },
    },
  },
})
