/**
 * Cmd+K コマンドパレット。
 *
 * 背景: 全アクションをファジー検索で実行するキーボードファーストUI。
 * Superhuman / Raycast のUXを参考にしている。
 * パレットが100ms以内に開き、最初の結果がタイピング後50ms以内にマッチ（spec §5.5）。
 *
 * 依存: cmdk ライブラリを使用。React用のコマンドパレットUIプリミティブで、
 * a11y対応とファジー検索を提供する。
 */
import { Command } from "cmdk";
import { useEffect, useState, useCallback } from "react";

interface CommandItem {
  id: string;
  label: string;
  /** ショートカットキー表示（例: "E", "⌘K"） */
  shortcut?: string;
  /** カテゴリ（グルーピング表示用） */
  group: string;
  onSelect: () => void;
}

/** デフォルトのコマンドリスト */
function getDefaultCommands(): CommandItem[] {
  return [
    { id: "compose", label: "新規メール作成", shortcut: "C", group: "アクション", onSelect: () => {} },
    { id: "search", label: "検索", shortcut: "/", group: "ナビゲーション", onSelect: () => {} },
    { id: "archive", label: "アーカイブ", shortcut: "E", group: "アクション", onSelect: () => {} },
    { id: "trash", label: "ゴミ箱", shortcut: "#", group: "アクション", onSelect: () => {} },
    { id: "star", label: "スター", shortcut: "S", group: "アクション", onSelect: () => {} },
    { id: "reply", label: "返信", shortcut: "R", group: "アクション", onSelect: () => {} },
    { id: "inbox", label: "受信トレイに移動", shortcut: "G I", group: "ナビゲーション", onSelect: () => {} },
    { id: "sent", label: "送信済みに移動", shortcut: "G S", group: "ナビゲーション", onSelect: () => {} },
    { id: "settings", label: "設定", shortcut: "⌘ ,", group: "アプリ", onSelect: () => {} },
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const commands = getDefaultCommands();

  /** Cmd+K (Mac) / Ctrl+K (Windows/Linux) でパレットをトグル */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  /** コマンドをグループ別に整理 */
  const groups = new Map<string, CommandItem[]>();
  for (const cmd of commands) {
    const group = groups.get(cmd.group) ?? [];
    group.push(cmd);
    groups.set(cmd.group, group);
  }

  return (
    <>
      {/* オーバーレイ */}
      <div
        onClick={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          zIndex: 9998,
        }}
      />

      {/* パレット本体 */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, 90vw)",
          background: "var(--color-bg)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--color-border)",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        <Command label="コマンドパレット">
          <Command.Input
            placeholder="コマンドを検索..."
            style={{
              width: "100%",
              padding: "var(--space-md) var(--space-lg)",
              border: "none",
              borderBottom: "1px solid var(--color-border-light)",
              fontSize: "var(--text-base)",
              outline: "none",
              background: "transparent",
              color: "var(--color-text)",
            }}
          />
          <Command.List
            style={{
              maxHeight: 320,
              overflow: "auto",
              padding: "var(--space-sm)",
            }}
          >
            <Command.Empty
              style={{
                padding: "var(--space-xl)",
                textAlign: "center",
                color: "var(--color-text-tertiary)",
                fontSize: "var(--text-sm)",
              }}
            >
              一致するコマンドがありません
            </Command.Empty>

            {[...groups.entries()].map(([groupName, items]) => (
              <Command.Group
                key={groupName}
                heading={groupName}
              >
                {items.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={() => {
                      cmd.onSelect();
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "var(--space-sm) var(--space-md)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-tertiary)",
                          background: "var(--color-bg-tertiary)",
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </>
  );
}
