/**
 * 認証が期限切れになったアカウントに対する再ログイン促しバナー。
 *
 * 背景: refresh_token 失効 / 権限剥奪などで Gmail API が 401/403 を返すと、
 * use-sync.ts / use-thread-messages.ts が accountsStore.connectionStatus を
 * "token_expired" に更新する。このバナーはその状態を購読し、画面上部に
 * アカウント単位で「再ログイン」ボタンを表示する。
 *
 * 以前はエラーが握りつぶされて UI には「スレッド 0 件」としか見えなかったため、
 * ユーザーが状況を把握できなかった問題を解消する。
 *
 * 関連:
 * - apps/web/src/lib/runtime.ts:84-90 (サーバー側 AuthExpiredError → 401 JSON)
 * - packages/core/src/errors.ts (AuthExpiredError 定義)
 * - packages/ui/src/hooks/use-sync.ts (AccountAuthExpiredError 検出)
 */
import { AlertTriangle } from "lucide-react";
import { useAccounts } from "../hooks/use-store";

interface AuthExpiredBannerProps {
  /** 再認証フローを開始するコールバック (Google OAuth 認可画面に遷移) */
  onReauth: () => void;
}

export function AuthExpiredBanner({ onReauth }: AuthExpiredBannerProps) {
  const accounts = useAccounts((s) => s.accounts);
  const connectionStatuses = useAccounts((s) => s.connectionStatuses);

  const expiredAccounts = accounts.filter((a) => connectionStatuses[a.id] === "token_expired");

  if (expiredAccounts.length === 0) return null;

  return (
    <div
      role="alert"
      className="border-b border-[var(--color-border-light)] bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-bg))]"
      data-testid="auth-expired-banner"
    >
      {expiredAccounts.map((account) => (
        <div
          key={account.id}
          className="flex items-center gap-3 px-5 py-3 text-[13px] md:text-[13px] text-[var(--color-text)]"
        >
          <AlertTriangle size={16} className="text-[var(--color-danger)] shrink-0" />
          <span className="flex-1 min-w-0 truncate">
            <span className="font-medium">{account.displayName || account.email}</span>
            <span className="text-[var(--color-text-secondary)]"> の認証が切れました。</span>
            <span className="text-[var(--color-text-secondary)]">
              メールを再取得するには再ログインしてください。
            </span>
          </span>
          <button
            type="button"
            onClick={onReauth}
            className="shrink-0 px-3 py-1.5 bg-[var(--color-accent)] text-white border-none rounded-lg cursor-pointer text-[12px] font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            再ログイン
          </button>
        </div>
      ))}
    </div>
  );
}
