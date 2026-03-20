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
  shortcut?: string;
  group: string;
  onSelect: () => void;
}

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

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
        className="fixed inset-0 bg-black/40 z-[9998]"
      />

      {/* パレット本体 */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[min(560px,90vw)] bg-[var(--color-bg)] rounded-lg shadow-xl border border-[var(--color-border)] z-[9999] overflow-hidden">
        <Command label="コマンドパレット">
          <Command.Input
            placeholder="コマンドを検索..."
            className="w-full px-4 py-3 border-none border-b border-[var(--color-border-light)] text-sm outline-none bg-transparent text-[var(--color-text)]"
          />
          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="py-6 text-center text-[var(--color-text-tertiary)] text-[13px]">
              一致するコマンドがありません
            </Command.Empty>

            {[...groups.entries()].map(([groupName, items]) => (
              <Command.Group key={groupName} heading={groupName}>
                {items.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={() => { cmd.onSelect(); setOpen(false); }}
                    className="flex items-center justify-between px-3 py-2 rounded cursor-pointer text-[13px] data-[selected=true]:bg-[var(--color-bg-hover)]"
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[11px] text-[var(--color-text-tertiary)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded font-mono">
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
