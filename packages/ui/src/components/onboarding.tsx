/**
 * 初回アカウント登録画面（オンボーディング）。
 *
 * 背景: アカウントが0件のときに表示する。3カラムレイアウトではなく、
 * 画面中央にシンプルなCTAを1つ配置する。
 * ユーザーが最初に登録したアカウントがメインアカウントになる。
 */

interface OnboardingProps {
  onStartAuth: () => void;
}

export function Onboarding({ onStartAuth }: OnboardingProps) {
  return (
    <div className="flex items-center justify-center h-full bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        {/* ロゴ */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">✉</span>
          <span className="text-xl font-bold tracking-tight">VantageMail</span>
        </div>

        {/* 説明 */}
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-medium text-[var(--color-text)] m-0">
            メールアカウントを接続して
          </p>
          <p className="text-[15px] font-medium text-[var(--color-text)] m-0">
            はじめましょう
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onStartAuth}
          className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[var(--color-accent)] text-white border-none rounded-lg cursor-pointer text-[14px] font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google アカウントで接続
        </button>

        {/* サブ説明 */}
        <p className="text-[11px] text-[var(--color-text-tertiary)] m-0">
          Gmail, Google Workspace に対応
        </p>
      </div>
    </div>
  );
}
