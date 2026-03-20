/**
 * Web版エントリーポイント。
 *
 * 背景: Cloudflare Workers 向けの Web アプリのブートストラップ。
 * @vantagemail/ui の App コンポーネントに OAuth 認証フローを注入する。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@vantagemail/ui";
import { createAuthorizationUrl } from "@vantagemail/core";
import "./app.css";

/**
 * OAuth 認証フローを開始する。
 * Google 認可画面にリダイレクトし、コールバックでトークンを取得する。
 *
 * 環境変数が未設定の場合はコンソールに警告を出す（開発中の便宜）。
 */
async function startAuth() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri =
    import.meta.env.VITE_OAUTH_REDIRECT_URI ??
    `${window.location.origin}/oauth/callback`;

  if (!clientId) {
    console.error(
      "VITE_GOOGLE_CLIENT_ID が未設定です。apps/web/.env.local を作成してください。",
      "詳細: infrastructure/SETUP_VALUES.md",
    );
    alert("OAuth が未設定です。開発環境の場合は .env.local を設定してください。");
    return;
  }

  const { url, codeVerifier } = await createAuthorizationUrl({
    clientId,
    redirectUri,
    tokenProxyUrl: import.meta.env.VITE_OAUTH_PROXY_URL,
  });

  sessionStorage.setItem("vantagemail_code_verifier", codeVerifier);
  window.location.href = url;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root 要素が見つかりません");

createRoot(root).render(
  <StrictMode>
    <App onStartAuth={startAuth} />
  </StrictMode>,
);
