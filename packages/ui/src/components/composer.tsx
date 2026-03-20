/**
 * メール作成・返信コンポーザー。
 *
 * 背景: Markdown対応リッチテキストエディタ（Tiptap/ProseMirror）で
 * メール作成と返信を行う。太字、斜体、リンク、リスト、コードブロック、
 * 引用をサポート。出力は標準HTML email（spec §5.3）。
 *
 * Tiptap を採用した理由:
 * - ProseMirror ベースで拡張性が高い（Notion, Linear でも採用）
 * - headless なので VantageMail のデザインに完全に馴染む
 * - Markdown ショートカット（**太字**, `コード` 等）をネイティブサポート
 */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useCallback } from "react";

interface ComposerProps {
  /** 返信先のスレッド情報（新規作成の場合はundefined） */
  replyTo?: {
    threadId: string;
    subject: string;
    to: Array<{ name: string; email: string }>;
    /** 引用するメール本文 */
    quotedHtml?: string;
  };
  /** 送信元のメールアドレス */
  fromEmail: string;
  /** 送信実行時のコールバック */
  onSend: (data: {
    to: string[];
    cc: string[];
    subject: string;
    htmlBody: string;
  }) => void;
  /** 閉じるボタンのコールバック */
  onClose: () => void;
}

/**
 * ツールバーボタン。アクティブ状態の視覚的フィードバック付き。
 */
function ToolbarButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "2px 8px",
        background: isActive ? "var(--color-bg-selected)" : "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        fontSize: "var(--text-xs)",
        fontFamily: "var(--font-mono)",
        color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
        fontWeight: isActive ? 600 : 400,
      }}
      title={label}
    >
      {label}
    </button>
  );
}

export function Composer({ replyTo, fromEmail, onSend, onClose }: ComposerProps) {
  const [to, setTo] = useState(
    replyTo?.to.map((r) => r.email).join(", ") ?? "",
  );
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    replyTo ? (replyTo.subject.startsWith("Re: ") ? replyTo.subject : `Re: ${replyTo.subject}`) : "",
  );
  const [showCc, setShowCc] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Markdownショートカットを有効化
        // **太字**, *斜体*, `コード`, > 引用, - リスト等
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "メッセージを入力...",
      }),
    ],
    // 返信時は引用を初期コンテンツとして設定
    content: replyTo?.quotedHtml
      ? `<p></p><blockquote>${replyTo.quotedHtml}</blockquote>`
      : "",
    editorProps: {
      attributes: {
        style: [
          "outline: none",
          "min-height: 120px",
          "font-size: var(--text-sm)",
          "line-height: 1.6",
          "color: var(--color-text)",
        ].join("; "),
      },
    },
  });

  const handleSend = useCallback(() => {
    if (!editor || !to.trim()) return;

    const htmlBody = editor.getHTML();
    onSend({
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      htmlBody,
    });
  }, [editor, to, cc, subject, onSend]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
      }}
    >
      {/* ヘッダー: From / To / Subject */}
      <div
        style={{
          padding: "var(--space-md)",
          borderBottom: "1px solid var(--color-border-light)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-xs)",
          fontSize: "var(--text-sm)",
        }}
      >
        {/* From */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span style={{ color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>From</span>
          <span style={{ color: "var(--color-text)" }}>{fromEmail}</span>
        </div>

        {/* To */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span style={{ color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>To</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "var(--text-sm)",
              background: "transparent",
              color: "var(--color-text)",
            }}
          />
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-tertiary)",
                cursor: "pointer",
                fontSize: "var(--text-xs)",
              }}
            >
              Cc
            </button>
          )}
        </div>

        {/* Cc（トグル表示） */}
        {showCc && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <span style={{ color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>Cc</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: "var(--text-sm)",
                background: "transparent",
                color: "var(--color-text)",
              }}
            />
          </div>
        )}

        {/* Subject */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span style={{ color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>件名</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="件名"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "var(--text-sm)",
              background: "transparent",
              color: "var(--color-text)",
              fontWeight: 500,
            }}
          />
        </div>
      </div>

      {/* フォーマットツールバー */}
      {editor && (
        <div
          style={{
            display: "flex",
            gap: "2px",
            padding: "var(--space-xs) var(--space-md)",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <ToolbarButton
            label="B"
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="I"
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="<>"
            isActive={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <ToolbarButton
            label="—"
            isActive={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <span style={{ width: 1, background: "var(--color-border-light)", margin: "0 4px" }} />
          <ToolbarButton
            label="• List"
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1. List"
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            label="❝ Quote"
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        </div>
      )}

      {/* エディタ本文 */}
      <div style={{ padding: "var(--space-md)", flex: 1, overflow: "auto" }}>
        <EditorContent editor={editor} />
      </div>

      {/* フッター: 送信ボタン */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-sm) var(--space-md)",
          borderTop: "1px solid var(--color-border-light)",
        }}
      >
        <button
          type="button"
          onClick={handleSend}
          disabled={!to.trim()}
          style={{
            padding: "var(--space-sm) var(--space-xl)",
            background: to.trim() ? "var(--color-accent)" : "var(--color-bg-tertiary)",
            color: to.trim() ? "#fff" : "var(--color-text-tertiary)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: to.trim() ? "pointer" : "default",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
          }}
        >
          送信
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "var(--space-sm) var(--space-md)",
            background: "transparent",
            border: "none",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
          }}
        >
          破棄
        </button>
      </div>
    </div>
  );
}
