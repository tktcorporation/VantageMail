/**
 * サイドバーコンポーネント。
 *
 * 背景: アカウントセレクター（未読バッジ付き）とラベルナビゲーションを表示。
 * 「すべて」選択でUnified Inbox、個別アカウントでフィルタリング（spec §5.1）。
 * アカウント識別はカラードットで行う（spec §10 Design未決事項あり）。
 */
import { useAccounts, useThreads } from "../hooks/use-store";
import { useCallback } from "react";

export function Sidebar() {
  const accounts = useAccounts((s) => s.accounts);
  const activeAccountId = useAccounts((s) => s.activeAccountId);
  const setActiveAccount = useAccounts((s) => s.setActiveAccount);
  const setActiveAccountFilter = useThreads((s) => s.setActiveAccountId);

  /** アカウント選択時に、accountsストアとthreadsストアの両方を更新する */
  const handleSelectAccount = useCallback(
    (accountId: string | null) => {
      setActiveAccount(accountId);
      setActiveAccountFilter(accountId);
    },
    [setActiveAccount, setActiveAccountFilter],
  );

  const totalUnread = accounts.reduce((sum, a) => sum + a.unreadCount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ロゴ */}
      <div
        style={{
          padding: "var(--space-lg)",
          fontWeight: 700,
          fontSize: "var(--text-lg)",
          letterSpacing: "-0.02em",
        }}
      >
        VantageMail
      </div>

      {/* アカウントセレクター */}
      <nav style={{ flex: 1, overflow: "auto" }}>
        {/* Unified Inbox */}
        <button
          type="button"
          onClick={() => handleSelectAccount(null)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "var(--space-sm) var(--space-lg)",
            background:
              activeAccountId === null
                ? "var(--color-bg-selected)"
                : "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            color: "var(--color-text)",
            borderRadius: "var(--radius-sm)",
            textAlign: "left",
          }}
        >
          <span>すべての受信トレイ</span>
          {totalUnread > 0 && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              {totalUnread}
            </span>
          )}
        </button>

        {/* 各アカウント */}
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => handleSelectAccount(account.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "var(--space-sm) var(--space-lg)",
              background:
                activeAccountId === account.id
                  ? "var(--color-bg-selected)"
                  : "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--text-sm)",
              color: "var(--color-text)",
              borderRadius: "var(--radius-sm)",
              textAlign: "left",
              gap: "var(--space-sm)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              {/* アカウント識別カラードット */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: account.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {account.displayName || account.email}
              </span>
            </span>
            {account.unreadCount > 0 && (
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-accent)",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {account.unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* フッター: アカウント追加 */}
      <div
        style={{
          padding: "var(--space-md) var(--space-lg)",
          borderTop: "1px solid var(--color-border-light)",
        }}
      >
        <button
          type="button"
          style={{
            width: "100%",
            padding: "var(--space-sm)",
            background: "transparent",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          + アカウントを追加
        </button>
      </div>
    </div>
  );
}
