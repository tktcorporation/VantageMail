/**
 * パッケージ境界を越える API パスの SSOT。
 *
 * 背景: `packages/core/src/gmail/oauth.ts` が「OAuth プロキシ」として呼ぶ
 * サーバーサイドルートのパスは、core (クライアント呼び出し) と apps/web
 * (サーバールート実装) の暗黙の契約。これを文字列リテラルで両側に書くと
 * SSOT 違反になるため、ここに集約する。
 *
 * 配置理由: `packages/core` は platform-agnostic を維持したい一方、これらの
 * パスはすでに oauth.ts が知っているため、契約は事実上 core 側にある。core
 * を SSOT にすることで、apps/web 側のルート定義 (file-based router の
 * `routes/api/oauth/token.ts` 等) と整合する。
 *
 * 純粋に app-internal なパス（例: /api/auth/start）は apps/web 側の
 * api-paths.ts に残す（core からは参照されないため）。
 */

/** OAuth トークン交換プロキシ（POST: code → token） */
export const API_OAUTH_TOKEN = "/api/oauth/token";

/** OAuth トークンリフレッシュプロキシ（POST: refresh_token → new tokens） */
export const API_OAUTH_REFRESH = "/api/oauth/refresh";
