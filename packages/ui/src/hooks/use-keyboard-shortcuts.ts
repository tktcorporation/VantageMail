/**
 * グローバルキーボードショートカットのハンドラ。
 *
 * 背景: vim式ナビゲーション（J/K移動、E=アーカイブ、S=スター、#=ゴミ箱、
 * R=返信、C=作成、/=検索）を実装する（spec §5.5 US-6）。
 * プリセット切替（Spark/Gmail/Superhuman/カスタム）は将来対応。
 * 入力フィールドにフォーカスがある場合はショートカットを無効化する。
 */
import { useEffect, useCallback } from "react";
import type { StoreApi } from "zustand";
import type { ThreadsStore } from "@vantagemail/core";

interface UseKeyboardShortcutsOptions {
  threadsStore: StoreApi<ThreadsStore>;
  onCompose?: () => void;
  onReply?: () => void;
  onSearch?: () => void;
}

/**
 * 入力要素にフォーカスがあるかどうかを判定する。
 * ショートカットキーが入力の邪魔にならないようにする。
 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement).isContentEditable
  );
}

export function useKeyboardShortcuts({
  threadsStore,
  onCompose,
  onReply,
  onSearch,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 入力中は無視（Cmd/Ctrlキーの組み合わせは除く）
      if (isInputFocused() && !e.metaKey && !e.ctrlKey) return;

      const state = threadsStore.getState();

      switch (e.key) {
        // アーカイブ: INBOXラベルを除去
        case "e": {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          if (!state.selectedThreadId) return;
          // 選択中のスレッドを見つけてINBOXラベルを除去
          for (const [accountId, threads] of Object.entries(
            state.threadsByAccount,
          )) {
            const thread = threads[state.selectedThreadId];
            if (thread) {
              state.updateThreadLabels(
                accountId,
                thread.id,
                thread.labelIds.filter((l) => l !== "INBOX"),
              );
              break;
            }
          }
          break;
        }

        // スター
        case "s": {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          if (!state.selectedThreadId) return;
          for (const [accountId, threads] of Object.entries(
            state.threadsByAccount,
          )) {
            if (threads[state.selectedThreadId]) {
              state.toggleStar(accountId, state.selectedThreadId);
              break;
            }
          }
          break;
        }

        // ゴミ箱
        case "#": {
          e.preventDefault();
          if (!state.selectedThreadId) return;
          for (const [accountId, threads] of Object.entries(
            state.threadsByAccount,
          )) {
            const thread = threads[state.selectedThreadId];
            if (thread) {
              state.updateThreadLabels(accountId, thread.id, [
                ...thread.labelIds.filter((l) => l !== "INBOX"),
                "TRASH",
              ]);
              break;
            }
          }
          break;
        }

        // 作成
        case "c": {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onCompose?.();
          break;
        }

        // 返信
        case "r": {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onReply?.();
          break;
        }

        // 検索
        case "/": {
          e.preventDefault();
          onSearch?.();
          break;
        }
      }
    },
    [threadsStore, onCompose, onReply, onSearch],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
