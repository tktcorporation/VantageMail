/**
 * OAuth認証フローのReactフック。
 *
 * 背景: 「+アカウント追加」ボタンからGoogleの認可画面を開き、
 * コールバックでトークンを取得してアカウントを登録するフロー全体を管理する。
 * PKCE code_verifier は sessionStorage に保持（タブをまたいでも安全）。
 *
 * フロー:
 * 1. startAuth() → code_verifier生成 → Google認可画面にリダイレクト
 * 2. コールバック → URLから code を読み取り
 * 3. handleCallback() → CF Worker経由でトークン交換 → ユーザー情報取得 → アカウント登録
 *
 * Effect 統合: 各非同期操作を Effect パイプラインで記述し、
 * Effect.runPromise で実行する。エラーハンドリングが統一される。
 */
import { useState, useCallback, useEffect } from "react";
import { Effect } from "effect";
import {
  createAuthorizationUrlEffect,
  exchangeCodeForTokensEffect,
  fetchUserInfoEffect,
} from "@vantagemail/core";
import type { OAuthConfig, Account } from "@vantagemail/core";

/** アカウントに割り当てるカラーのプール */
const ACCOUNT_COLORS = [
  "#228be6", "#40c057", "#fab005", "#fa5252",
  "#7950f2", "#e64980", "#15aabf", "#fd7e14",
];

interface UseOAuthOptions {
  oauthConfig: OAuthConfig;
  onAccountAdded: (account: Account, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => void;
  existingAccountCount: number;
}

export function useOAuth({ oauthConfig, onAccountAdded, existingAccountCount }: UseOAuthOptions) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * OAuth認証フローを開始する。
   * Effect パイプラインで認可URL生成 → sessionStorage 保存 → リダイレクトを実行。
   */
  const startAuth = useCallback(async () => {
    setError(null);
    setIsAuthenticating(true);

    const program = Effect.gen(function* () {
      const { url, codeVerifier } = yield* createAuthorizationUrlEffect(oauthConfig);
      // PKCE code_verifier をセッションに保存（コールバック時に使用）
      sessionStorage.setItem("vantagemail_code_verifier", codeVerifier);
      // 同じタブでリダイレクト
      window.location.href = url;
    });

    try {
      await Effect.runPromise(program);
    } catch (err) {
      setError(err instanceof Error ? err.message : "認証の開始に失敗しました");
      setIsAuthenticating(false);
    }
  }, [oauthConfig]);

  /**
   * OAuthコールバックを処理する。
   * URLのクエリパラメータから authorization code を読み取り、
   * Effect パイプラインでトークン交換 → ユーザー情報取得 → アカウント登録を行う。
   */
  const handleCallback = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const authError = params.get("error");

    if (authError) {
      setError(`Google認証エラー: ${authError}`);
      setIsAuthenticating(false);
      // URLからパラメータをクリーン
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (!code) return; // コールバックではない通常のページロード

    const codeVerifier = sessionStorage.getItem("vantagemail_code_verifier");
    if (!codeVerifier) {
      setError("認証セッションが見つかりません。もう一度お試しください。");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setIsAuthenticating(true);

    const program = Effect.gen(function* () {
      // トークン交換
      const tokens = yield* exchangeCodeForTokensEffect(oauthConfig, code, codeVerifier);
      sessionStorage.removeItem("vantagemail_code_verifier");

      // ユーザー情報取得
      const userInfo = yield* fetchUserInfoEffect(tokens.accessToken);

      // アカウント作成
      const account: Account = {
        id: crypto.randomUUID(),
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
        color: ACCOUNT_COLORS[existingAccountCount % ACCOUNT_COLORS.length],
        unreadCount: 0,
        notificationsEnabled: true,
      };

      onAccountAdded(account, tokens);

      // URLからパラメータをクリーン
      window.history.replaceState({}, "", window.location.pathname);
    });

    try {
      await Effect.runPromise(program);
    } catch (err) {
      setError(err instanceof Error ? err.message : "トークン交換に失敗しました");
    } finally {
      setIsAuthenticating(false);
    }
  }, [oauthConfig, onAccountAdded, existingAccountCount]);

  // ページロード時にOAuthコールバックをチェック
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code") || params.has("error")) {
      handleCallback();
    }
  }, [handleCallback]);

  return { startAuth, isAuthenticating, error };
}
