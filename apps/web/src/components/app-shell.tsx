/**
 * Web 版のアプリシェル。
 *
 * 背景: packages/ui の App コンポーネントに Web 固有の認証フローを注入する。
 * OAuth の開始はサーバーサイドの /api/auth/start を呼び出し、
 * PKCE code_verifier のサーバー側保管と認可URL生成を委譲する。
 * アカウント削除もサーバーサイドの /api/accounts で処理する。
 * クライアントには秘密情報を一切保持しない。
 */
import { App, RuntimeContext } from "@vantagemail/ui";
import type { Account } from "@vantagemail/core";
import { useCallback } from "react";
import { ManagedRuntime, Layer } from "effect";

/**
 * Effect ManagedRuntime のシングルトンインスタンス。
 *
 * 背景: 現時点では Layer.empty で十分だが、将来的に HttpClient 等を追加する際に
 * ここで Layer を構成できる。コンポーネントの外で生成し、再レンダリングで
 * インスタンスが変わらないようにする。
 */
const runtime = ManagedRuntime.make(Layer.empty);

interface AppShellProps {
  initialAccounts?: Account[];
}

export function AppShell({ initialAccounts }: AppShellProps) {
  /**
   * OAuth 認証フローをサーバー経由で開始する。
   * サーバーが PKCE 生成 → 暗号化セッションに保存 → 認可URLを返す。
   */
  const handleStartAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/start", { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `認証開始に失敗: ${response.status}`);
      }
      const { url } = (await response.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      console.error("OAuth 開始エラー:", err);
      alert(
        err instanceof Error
          ? err.message
          : "認証の開始に失敗しました。環境変数を確認してください。",
      );
    }
  }, []);

  /**
   * アカウント連携を解除する。
   * サーバーの暗号化セッションからアカウント＋トークンを削除する。
   */
  const handleRemoveAccount = useCallback(async (accountId: string) => {
    const res = await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    if (!res.ok) {
      throw new Error(`Account removal failed: ${res.status}`);
    }
  }, []);

  return (
    <RuntimeContext.Provider value={runtime}>
      <App
        onStartAuth={handleStartAuth}
        onRemoveAccount={handleRemoveAccount}
        initialAccounts={initialAccounts}
      />
    </RuntimeContext.Provider>
  );
}
