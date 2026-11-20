// @vitest-environment jsdom
/**
 * Composer のエディタ設定（Tiptap）のテスト。
 *
 * 背景: エディタの拡張の組み方を変えると、送信する HTML の形・リンクの属性・
 * プレースホルダーが黙って変わりうる。ここではキー入力を伴わない部分を jsdom で確かめ、
 * 入力・ツールバー・自動リンクは composer.browser.test.tsx が実ブラウザで確かめる。
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "../composer";

afterEach(() => {
  cleanup();
});

/** エディタの本体要素。immediatelyRender: false のためマウント後に現れる。 */
async function findEditorRoot(container: HTMLElement): Promise<HTMLElement> {
  return waitFor(() => {
    const root = container.querySelector<HTMLElement>(".ProseMirror");
    if (!root) throw new Error("editor not mounted yet");
    return root;
  });
}

describe("Composer", () => {
  it("新規作成では空の段落にプレースホルダーを付ける", async () => {
    const { container } = render(
      <Composer fromEmail="me@example.com" onSend={vi.fn()} onClose={vi.fn()} />,
    );
    const root = await findEditorRoot(container);
    const empty = root.querySelector("p.is-editor-empty");
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute("data-placeholder")).toBe("メッセージを入力...");
  });

  it("返信では引用とリンクを保ったまま、末尾に段落を足さずに送る", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer
        replyTo={{
          threadId: "t1",
          subject: "Hello",
          to: [{ name: "Alice", email: "alice@example.com" }],
          quotedHtml: '<p>see <a href="https://example.com/doc">the doc</a></p>',
        }}
        fromEmail="me@example.com"
        onSend={onSend}
        onClose={vi.fn()}
      />,
    );
    await findEditorRoot(container);
    await screen.findByTitle("B");

    fireEvent.click(screen.getByText("送信"));

    expect(onSend).toHaveBeenCalledWith({
      to: ["alice@example.com"],
      cc: [],
      subject: "Re: Hello",
      htmlBody:
        '<p></p><blockquote><p>see <a target="_blank" rel="noopener noreferrer" href="https://example.com/doc">the doc</a></p></blockquote>',
    });
  });
});
