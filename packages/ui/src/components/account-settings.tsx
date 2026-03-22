/**
 * アカウント設定画面コンポーネント。
 *
 * 背景: 接続済みGmailアカウントの一覧表示・追加・削除を行う。
 * サイドバーの「設定」ボタンから遷移し、ThreadViewの代わりに右ペインに表示される。
 *
 * メインアカウント（最初に登録したアカウント）は大きく表示し、削除不可。
 * その他のアカウントはコンパクトな1行表示で、削除可能。
 * メインアカウントは途中で変更できない設計判断（docs/design-decisions.md 参照）。
 */
import { useAccounts } from "../hooks/use-store";
import type { MouseEvent } from "react";

export interface AccountSettingsProps {
  onAddAccount?: () => void;
  onRemoveAccount?: (accountId: string) => void;
  /** モバイルでリスト画面に戻るコールバック */
  onBack?: () => void;
}

export function AccountSettings({ onAddAccount, onRemoveAccount, onBack }: AccountSettingsProps) {
  const accounts = useAccounts((s) => s.accounts);

  const mainAccount = accounts[0] ?? null;
  const otherAccounts = accounts.slice(1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* ヘッダー */}
      <div className="px-8 py-6 border-b border-[var(--color-border-light)]">
        {/* モバイル: 戻るボタン */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden flex items-center gap-1 mb-3 px-0 py-0 border-none bg-transparent cursor-pointer text-[13px] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            戻る
          </button>
        )}
        <h1 className="text-[18px] font-semibold m-0">設定</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-2 mb-0">アカウント</p>
      </div>

      <div className="px-8 py-6 flex flex-col gap-6">
        {/* メインアカウント */}
        {mainAccount && (
          <div>
            <h2 className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider m-0 mb-3">
              メインアカウント
            </h2>
            <div className="p-5 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-light)]">
              <div className="flex items-center gap-4">
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ background: mainAccount.color }}
                />
                <div>
                  <div className="text-[14px] font-semibold">
                    {mainAccount.displayName || mainAccount.email}
                  </div>
                  <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
                    {mainAccount.email}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* その他のアカウント */}
        {otherAccounts.length > 0 && (
          <div>
            <h2 className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider m-0 mb-3">
              その他のアカウント
            </h2>
            <div className="flex flex-col gap-2">
              {otherAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-light)]"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: account.color }}
                  />
                  <span className="text-[13px] font-medium truncate">
                    {account.displayName || account.email}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                    {account.email}
                  </span>
                  <div className="flex-1" />
                  {onRemoveAccount && (
                    <button
                      type="button"
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        if (confirm(`${account.email} の連携を解除しますか？`)) {
                          onRemoveAccount(account.id);
                        }
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] border border-[var(--color-danger,#fa5252)] bg-transparent cursor-pointer text-[var(--color-danger,#fa5252)] hover:bg-[var(--color-danger,#fa5252)] hover:text-white transition-colors"
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* アカウント追加ボタン */}
      {onAddAccount && (
        <div className="px-8 py-6">
          <button
            type="button"
            onClick={onAddAccount}
            className="w-full py-3.5 bg-transparent border border-dashed border-[var(--color-border)] rounded-2xl cursor-pointer text-[13px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            + アカウントを追加
          </button>
        </div>
      )}
    </div>
  );
}
