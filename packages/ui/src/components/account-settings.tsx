/**
 * アカウント設定画面コンポーネント。
 *
 * 背景: 接続済みGmailアカウントの一覧表示・追加・削除を行う。
 * サイドバーの「設定」ボタンから遷移し、ThreadViewの代わりに右ペインに表示される。
 * 各アカウントはカラードット・メール・表示名・接続状態・削除ボタンを持つ。
 */
import { useAccounts } from "../hooks/use-store";
import type { MouseEvent } from "react";
import type { AccountConnectionStatus } from "@vantagemail/core";

export interface AccountSettingsProps {
  onAddAccount?: () => void;
  onRemoveAccount?: (accountId: string) => void;
}

/** 接続状態の日本語表示マッピング */
const CONNECTION_STATUS_LABELS: Record<AccountConnectionStatus, string> = {
  connected: "接続済み",
  refreshing: "更新中...",
  token_expired: "再認証が必要",
  error: "エラー",
};

/** 接続状態に応じたカラー。正常時は緑、エラー系は赤/黄で視覚的に区別する。 */
const CONNECTION_STATUS_COLORS: Record<AccountConnectionStatus, string> = {
  connected: "var(--color-success, #40c057)",
  refreshing: "var(--color-warning, #fab005)",
  token_expired: "var(--color-danger, #fa5252)",
  error: "var(--color-danger, #fa5252)",
};

export function AccountSettings({ onAddAccount, onRemoveAccount }: AccountSettingsProps) {
  const accounts = useAccounts((s) => s.accounts);
  const connectionStatuses = useAccounts((s) => s.connectionStatuses);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-[var(--color-border-light)]">
        <h1 className="text-[16px] font-semibold m-0">設定</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-1 mb-0">
          接続済みアカウントの管理
        </p>
      </div>

      {/* アカウント一覧 */}
      <div className="px-6 py-4 flex flex-col gap-3">
        <h2 className="text-[13px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider m-0">
          アカウント
        </h2>

        {accounts.length === 0 ? (
          <div className="text-[13px] text-[var(--color-text-tertiary)] py-4">
            接続されたアカウントはありません
          </div>
        ) : (
          accounts.map((account) => {
            const status: AccountConnectionStatus =
              connectionStatuses[account.id] ?? "connected";
            return (
              <div
                key={account.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-light)]"
              >
                {/* カラードット */}
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: account.color }}
                />

                {/* アカウント情報 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">
                    {account.displayName || account.email}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-secondary)] truncate">
                    {account.email}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: CONNECTION_STATUS_COLORS[status] }}
                    />
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">
                      {CONNECTION_STATUS_LABELS[status]}
                    </span>
                  </div>
                </div>

                {/* 削除ボタン */}
                {onRemoveAccount && (
                  <button
                    type="button"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      if (confirm(`${account.email} の連携を解除しますか？`)) {
                        onRemoveAccount(account.id);
                      }
                    }}
                    className="shrink-0 px-3 py-1 rounded text-[12px] border border-[var(--color-border)] bg-transparent cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-danger,#fa5252)] hover:border-[var(--color-danger,#fa5252)] transition-colors"
                  >
                    削除
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* アカウント追加ボタン（コールバックが提供されている場合のみ表示） */}
      {onAddAccount && (
        <div className="px-6 py-4">
          <button
            type="button"
            onClick={onAddAccount}
            className="w-full py-2.5 bg-transparent border border-dashed border-[var(--color-border)] rounded-lg cursor-pointer text-[13px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            + アカウントを追加
          </button>
        </div>
      )}
    </div>
  );
}
