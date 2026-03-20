/**
 * Web 版のアプリシェル。
 *
 * packages/ui の App コンポーネントに Web 固有の OAuth フローを注入する。
 */
import { App } from "@vantagemail/ui";
import { createAuthorizationUrl } from "@vantagemail/core";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function AppShell() {
  const navigate = useNavigate();

  const handleStartAuth = useCallback(async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri =
      import.meta.env.VITE_OAUTH_REDIRECT_URI ??
      `${window.location.origin}/oauth/callback`;

    if (!clientId) {
      console.error("VITE_GOOGLE_CLIENT_ID が未設定です。");
      alert("OAuth が未設定です。環境変数を確認してください。");
      return;
    }

    const { url, codeVerifier } = await createAuthorizationUrl({
      clientId,
      redirectUri,
    });

    sessionStorage.setItem("vantagemail_code_verifier", codeVerifier);
    window.location.href = url;
  }, []);

  return <App onStartAuth={handleStartAuth} />;
}
