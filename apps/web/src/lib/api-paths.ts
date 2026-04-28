/**
 * Web 版アプリの app-internal な API パス（SSOT）。
 *
 * 背景: クライアント側の fetch 先パスとサーバールート定義（routes/api/**）が
 * 文字列リテラルとして二重管理されないよう、ここに集約する。
 *
 * パッケージ境界を越える OAuth プロキシパス（`packages/core/src/gmail/oauth.ts`
 * から呼ばれるもの）は `packages/core/src/api-paths.ts` 側で定義する。
 * 本ファイルは apps/web 内のクライアントだけが使うパスを扱う。
 */

/** OAuth 認証フロー開始（POST: 認可URLを返す） */
export const API_AUTH_START = "/api/auth/start";

/** 連携アカウント API（GET: 一覧 / DELETE: 削除） */
export const API_ACCOUNTS = "/api/accounts";
