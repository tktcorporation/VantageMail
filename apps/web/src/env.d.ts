/**
 * Cloudflare Workers 環境の型宣言。
 *
 * 背景: compatibility_date >= 2025-04-01 により nodejs_compat_populate_process_env が
 * デフォルト有効。Worker の bindings/secrets が process.env にマッピングされる。
 * @types/node を入れると不要な Node.js API の型も入るため、最小限の宣言だけ行う。
 */
declare const process: {
  env: Record<string, string | undefined>;
};
