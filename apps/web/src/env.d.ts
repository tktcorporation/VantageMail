/**
 * Cloudflare Workers 環境の型宣言。
 *
 * 背景: @cloudflare/workers-types を入れると Worker 固有の型が DOM 型と衝突する。
 * TanStack Start は DOM + Worker のハイブリッド環境なので、必要最小限の宣言だけ行う。
 */

/** cloudflare:workers モジュールの env export（Worker bindings へのアクセス） */
declare module "cloudflare:workers" {
  const env: Record<string, unknown>;
  export { env };
}
