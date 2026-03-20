/**
 * スレッド詳細ビューコンポーネント。
 *
 * 背景: 選択されたスレッドのメッセージを表示する右ペイン。
 * 個別メッセージの折りたたみ/展開、インライン添付ファイル表示を行う。
 * 5通以上のスレッドはデフォルト折りたたみ（spec §5.2）。
 */
import { useThreads } from "../hooks/use-store";
import { useAccounts } from "../hooks/use-store";
import { useMemo } from "react";

export function ThreadView() {
  const selectedThreadId = useThreads((s) => s.selectedThreadId);
  const threadsByAccount = useThreads((s) => s.threadsByAccount);
  const accounts = useAccounts((s) => s.accounts);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    for (const accountThreads of Object.values(threadsByAccount)) {
      const thread = accountThreads[selectedThreadId];
      if (thread) return thread;
    }
    return null;
  }, [selectedThreadId, threadsByAccount]);

  const account = useMemo(() => {
    if (!selectedThread) return null;
    return accounts.find((a) => a.id === selectedThread.accountId) ?? null;
  }, [selectedThread, accounts]);

  if (!selectedThread) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--color-text-tertiary)",
          gap: "var(--space-md)",
        }}
      >
        <span style={{ fontSize: "32px" }}>✉</span>
        <span style={{ fontSize: "var(--text-sm)" }}>
          スレッドを選択してください
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
          J / K で移動、O で開く
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "auto",
      }}
    >
      {/* スレッドヘッダー */}
      <div
        style={{
          padding: "var(--space-xl)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
          {account && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: account.color,
              }}
            />
          )}
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            {account?.email}
          </span>
        </div>
        <h1
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {selectedThread.subject}
        </h1>
        <div
          style={{
            marginTop: "var(--space-sm)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-secondary)",
          }}
        >
          {selectedThread.participants.join(", ")} · {selectedThread.messageCount}通
        </div>
      </div>

      {/* メッセージ本文のプレースホルダー */}
      <div
        style={{
          flex: 1,
          padding: "var(--space-xl)",
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
        }}
      >
        {/* TODO: Gmail APIからメッセージ本文を取得して表示する。 */}
        {/* 現在はスニペットを表示。 */}
        <p>{selectedThread.snippet}</p>
      </div>

      {/* 返信バー */}
      <div
        style={{
          padding: "var(--space-lg) var(--space-xl)",
          borderTop: "1px solid var(--color-border-light)",
        }}
      >
        <button
          type="button"
          style={{
            padding: "var(--space-sm) var(--space-lg)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          返信
        </button>
      </div>
    </div>
  );
}
