/**
 * Cloudflare Workers 環境の型宣言。
 *
 * 背景: wrangler.jsonc の nodejs_compat フラグにより process.env が
 * ランタイムで利用可能だが、TypeScript の型定義がないためコンパイルエラーになる。
 * @types/node を入れると不要な Node.js API の型も入るため、
 * 必要最小限の宣言だけ行う。
 */
declare const process: {
  env: Record<string, string | undefined>;
};
