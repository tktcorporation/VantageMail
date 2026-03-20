/**
 * Web版エントリーポイント。
 *
 * 背景: Cloudflare Workers 向けの Web アプリのブートストラップ。
 * @vantagemail/ui の App コンポーネントに OAuth 認証フローを注入する。
 *
 * OAuth フロー:
 * 1. ユーザーが「アカウント追加」をクリック → startAuth() → Google 認可画面
 * 2. 認可後、/oauth/callback?code=xxx にリダイレクト
 * 3. handleOAuthCallback() で code → トークン交換 → アカウント登録
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@vantagemail/ui";
import {
  createAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
} from "@vantagemail/core";
import "./app.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI =
  import.meta.env.VITE_OAUTH_REDIRECT_URI ??
  `${window.location.origin}/oauth/callback`;
const TOKEN_PROXY_URL = import.meta.env.VITE_OAUTH_PROXY_URL;

/**
 * OAuth 認証フローを開始する。
 * Google 認可画面にリダイレクトする。
 */
async function startAuth() {
  if (!CLIENT_ID) {
    console.error(
      "VITE_GOOGLE_CLIENT_ID が未設定です。",
      "本番: CF Workers Build environment variables に設定",
      "開発: apps/web/.env.local を作成",
    );
    alert("OAuth が未設定です。環境変数を確認してください。");
    return;
  }

  const { url, codeVerifier } = await createAuthorizationUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    tokenProxyUrl: TOKEN_PROXY_URL,
  });

  sessionStorage.setItem("vantagemail_code_verifier", codeVerifier);
  window.location.href = url;
}

/**
 * OAuth コールバックを処理する。
 * URL に ?code= がある場合、トークン交換を実行する。
 */
async function handleOAuthCallback(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (!code && !error) return; // コールバックではない通常のページロード

  // URL をクリーンアップ（code パラメータを消す）
  window.history.replaceState({}, "", window.location.pathname);

  if (error) {
    console.error("OAuth エラー:", error);
    alert(`Google 認証エラー: ${error}`);
    return;
  }

  const codeVerifier = sessionStorage.getItem("vantagemail_code_verifier");
  if (!codeVerifier) {
    console.error("code_verifier が見つかりません。もう一度認証してください。");
    alert("認証セッションが見つかりません。もう一度お試しください。");
    return;
  }

  try {
    // トークン交換
    const tokens = await exchangeCodeForTokens(
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, tokenProxyUrl: TOKEN_PROXY_URL },
      code,
      codeVerifier,
    );
    sessionStorage.removeItem("vantagemail_code_verifier");

    // ユーザー情報取得
    const userInfo = await fetchUserInfo(tokens.accessToken);

    // TODO: アカウントをストアに登録し、トークンを安全に保存する
    console.log("OAuth 成功:", userInfo.email);
    console.log("トークン取得完了（accessToken, refreshToken）");
    alert(`${userInfo.email} のアカウント追加に成功しました！\n（トークン保存は未実装）`);
  } catch (err) {
    console.error("トークン交換に失敗:", err);
    alert(`トークン交換に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ページロード時に OAuth コールバックをチェック
handleOAuthCallback();

const root = document.getElementById("root");
if (!root) throw new Error("#root 要素が見つかりません");

createRoot(root).render(
  <StrictMode>
    <App onStartAuth={startAuth} />
  </StrictMode>,
);
