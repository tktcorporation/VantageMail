/**
 * アプリケーション設定の Effect Service。
 *
 * 背景: Cloudflare Workers では環境変数が Worker bindings として提供される。
 * nodejs_compat_populate_process_env により process.env にもマッピングされる。
 * ConfigService で設定値を一元管理し、不足時は ConfigMissingError を返す。
 *
 * 使用箇所: OAuth 設定、暗号化キー導出、CORS 設定
 */
import { Context, Effect, Layer } from "effect"
import { ConfigMissingError } from "@vantagemail/core"

/**
 * アプリケーション全体で必要な設定値。
 * Cloudflare Workers の env bindings + process.env から構築される。
 */
export interface AppConfig {
  googleClientId: string
  googleClientSecret: string
  serverSecret: string
  allowedOrigins: string[]
}

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  AppConfig
>() {
  /**
   * Cloudflare Workers の env から設定値を抽出して Layer を構築する。
   *
   * process.env にシークレットがマッピングされるため、env オブジェクト自体には
   * シークレットが含まれない場合がある。両方をフォールバックとしてチェックする。
   *
   * 開発環境ではフォールバック値を提供し、本番では必須チェックを行う。
   */
  static layer = (env: Cloudflare.Env) =>
    Layer.effect(
      ConfigService,
      Effect.gen(function* () {
        const getRequired = (key: string, envValue?: string): string => {
          const value = envValue ?? process.env[key]
          if (value) return value
          if (process.env.NODE_ENV === "production") {
            // Effect.gen 内で throw すると Effect がキャッチして defect にする。
            // ここでは起動時のバリデーションなので fail より適切。
            throw new ConfigMissingError({ key })
          }
          // 開発環境用フォールバック
          return `dev-${key}-placeholder`
        }

        const allowedOriginsRaw =
          env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? ""

        return {
          googleClientId: getRequired("GOOGLE_CLIENT_ID"),
          googleClientSecret: getRequired("GOOGLE_CLIENT_SECRET"),
          serverSecret: getRequired(
            "SERVER_SECRET",
            // 開発環境のフォールバックは session.ts と合わせる
            process.env.SERVER_SECRET,
          ),
          allowedOrigins: allowedOriginsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }
      }),
    )
}
