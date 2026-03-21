/**
 * アプリケーション設定の Effect Service。
 *
 * 背景: Cloudflare Workers では環境変数が Worker bindings として提供される。
 * nodejs_compat_populate_process_env により process.env にもマッピングされる。
 * ConfigService で設定値を一元管理し、不足時は ConfigMissingError を返す。
 *
 * 使用箇所: OAuth 設定、暗号化キー導出、CORS 設定
 */
import { Context, Effect, Layer } from "effect";
import { ConfigMissingError } from "@vantagemail/core";

/**
 * アプリケーション全体で必要な設定値。
 * Cloudflare Workers の env bindings から構築される。
 *
 * GOOGLE_CLIENT_ID は VITE_GOOGLE_CLIENT_ID として import.meta.env でビルド時に
 * インライン化されるため、ここには含めない。
 */
export interface AppConfig {
  googleClientSecret: string;
  serverSecret: string;
  /** セッション Cookie の暗号化パスワード。wrangler secret put SESSION_SECRET で設定 */
  sessionSecret: string;
  allowedOrigins: string[];
}

export class ConfigService extends Context.Tag("ConfigService")<ConfigService, AppConfig>() {
  /**
   * Cloudflare Workers の env から設定値を抽出して Layer を構築する。
   *
   * process.env にシークレットがマッピングされるため、env オブジェクト自体には
   * シークレットが含まれない場合がある。両方をフォールバックとしてチェックする。
   *
   * 開発環境ではフォールバック値を提供し、本番では必須チェックを行う。
   */
  /**
   * Cloudflare Workers の env bindings から設定値を取得して Layer を構築する。
   *
   * secrets (GOOGLE_CLIENT_SECRET, SERVER_SECRET) は env オブジェクトに直接入る。
   * process.env にもマッピングされるが、タイミングによっては未定義の場合があるため
   * env オブジェクトを優先する。
   */
  static layer = (env: Cloudflare.Env) =>
    Layer.effect(
      ConfigService,
      Effect.gen(function* () {
        // env オブジェクト → process.env の順でフォールバック
        const get = (key: string): string | undefined =>
          ((env as Record<string, unknown>)[key] as string | undefined) ?? process.env[key];

        const requireKey = (key: string) => {
          const value = get(key);
          // 空文字列も missing として扱う（wrangler secret が空で設定されるケースを防ぐ）
          if (value) return Effect.succeed(value);
          return Effect.fail(new ConfigMissingError({ key }));
        };

        const allowedOriginsRaw = get("ALLOWED_ORIGINS") ?? "";

        const googleClientSecret = yield* requireKey("GOOGLE_CLIENT_SECRET");
        const serverSecret = yield* requireKey("SERVER_SECRET");

        // 開発環境ではフォールバック値を提供し、本番では必須
        const sessionSecret =
          get("SESSION_SECRET") ??
          (get("NODE_ENV") === "production"
            ? yield* Effect.fail(new ConfigMissingError({ key: "SESSION_SECRET" }))
            : "vantagemail-dev-session-secret-min-32-chars!!");

        return {
          googleClientSecret,
          serverSecret,
          sessionSecret,
          allowedOrigins: allowedOriginsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }),
    );
}
