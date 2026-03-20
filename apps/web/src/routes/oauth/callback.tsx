/**
 * OAuth コールバックルート（/oauth/callback）。
 *
 * 背景: Google OAuth 認証後のリダイレクト先。
 * TanStack Start のファイルベースルーティングにより、このファイルが
 * /oauth/callback に自動マッピングされる。SPA フォールバック問題が構造的に解消。
 *
 * フロー: ?code=xxx → トークン交換 → ユーザー情報取得 → / にリダイレクト
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exchangeCodeForTokens, fetchUserInfo } from "@vantagemail/core";

export const Route = createFileRoute("/oauth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const [status, setStatus] = useState<"processing" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setErrorMessage(`Google 認証エラー: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("認可コードがありません");
      return;
    }

    const codeVerifier = sessionStorage.getItem("vantagemail_code_verifier");
    if (!codeVerifier) {
      setStatus("error");
      setErrorMessage("認証セッションが見つかりません。もう一度お試しください。");
      return;
    }

    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri =
        import.meta.env.VITE_OAUTH_REDIRECT_URI ??
        `${window.location.origin}/oauth/callback`;

      const tokens = await exchangeCodeForTokens(
        { clientId, redirectUri },
        code,
        codeVerifier,
      );
      sessionStorage.removeItem("vantagemail_code_verifier");

      const userInfo = await fetchUserInfo(tokens.accessToken);

      // TODO: アカウントをストアに登録し、トークンを安全に保存する
      console.log("OAuth 成功:", userInfo.email);

      // メイン画面に戻る
      navigate({ to: "/" });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "トークン交換に失敗しました",
      );
    }
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <span className="text-4xl">⚠</span>
        <p className="text-[var(--color-text)]">{errorMessage}</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm"
        >
          ホームに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-3">
      <span className="text-4xl animate-spin">⏳</span>
      <p className="text-[var(--color-text-secondary)]">認証中...</p>
    </div>
  );
}
