/**
 * Composer のエディタ入力のブラウザテスト。
 *
 * 背景: ProseMirror のキー入力・入力規則（自動リンク）・ツールバーの再描画は
 * jsdom では再現できないため、vitest browser mode（Playwright + Chromium）で確かめる。
 * 入力を伴わない設定（送信 HTML の形・プレースホルダー）は composer.test.tsx が見る。
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Composer } from "../composer";

afterEach(() => {
  cleanup();
});

/** 宛先を入れて送信し、onSend に渡った本文の HTML を返す。 */
async function sendAndGetHtml(onSend: ReturnType<typeof vi.fn>): Promise<string> {
  await userEvent.type(screen.getByPlaceholderText("recipient@example.com"), "bob@example.com");
  await userEvent.click(screen.getByText("送信"));
  expect(onSend).toHaveBeenCalledTimes(1);
  return onSend.mock.calls[0][0].htmlBody;
}

async function focusEditor(container: HTMLElement): Promise<HTMLElement> {
  const root = await waitFor(() => {
    const el = container.querySelector<HTMLElement>(".ProseMirror");
    if (!el) throw new Error("editor not mounted yet");
    return el;
  });
  await userEvent.click(root);
  return root;
}

describe("Composer (browser)", () => {
  it("入力した文字が本文になり、プレースホルダーが消える", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer fromEmail="me@example.com" onSend={onSend} onClose={vi.fn()} />,
    );
    const root = await focusEditor(container);
    await userEvent.keyboard("hello");

    await waitFor(() => expect(root.querySelector("p.is-editor-empty")).toBeNull());
    expect(await sendAndGetHtml(onSend)).toBe("<p>hello</p>");
  });

  it("ツールバーの B で太字になり、ボタンがアクティブ表示になる", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer fromEmail="me@example.com" onSend={onSend} onClose={vi.fn()} />,
    );
    await focusEditor(container);
    const bold = await screen.findByTitle("B");
    expect(bold.style.fontWeight).toBe("400");

    await userEvent.click(bold);
    await userEvent.keyboard("strong");

    await waitFor(() => expect(bold.style.fontWeight).toBe("600"));
    expect(await sendAndGetHtml(onSend)).toBe("<p><strong>strong</strong></p>");
  });

  it("Ctrl+U を押しても下線にならない（ツールバーに下線が無いため）", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer fromEmail="me@example.com" onSend={onSend} onClose={vi.fn()} />,
    );
    await focusEditor(container);
    await userEvent.keyboard("{Control>}u{/Control}plain");

    expect(await sendAndGetHtml(onSend)).toBe("<p>plain</p>");
  });

  it("URL を入力して区切ると、rel 付きのリンクになる", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer fromEmail="me@example.com" onSend={onSend} onClose={vi.fn()} />,
    );
    const root = await focusEditor(container);
    await userEvent.keyboard("see https://example.com ok");

    await waitFor(() => expect(root.querySelector("a")).not.toBeNull());
    expect(await sendAndGetHtml(onSend)).toBe(
      '<p>see <a target="_blank" rel="noopener noreferrer" href="https://example.com">https://example.com</a> ok</p>',
    );
  });

  it("返信で本文を入力しても、引用の後ろに段落を足さない", async () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer
        replyTo={{
          threadId: "t1",
          subject: "Hello",
          to: [{ name: "Alice", email: "alice@example.com" }],
          quotedHtml: "<p>quoted</p>",
        }}
        fromEmail="me@example.com"
        onSend={onSend}
        onClose={vi.fn()}
      />,
    );
    const root = await focusEditor(container);
    const firstParagraph = root.querySelector("p");
    if (!firstParagraph) throw new Error("reply editor has no leading paragraph");
    // 引用の前の空段落に入力する
    await userEvent.click(firstParagraph);
    await userEvent.keyboard("hi");

    await userEvent.click(screen.getByText("送信"));
    expect(onSend.mock.calls[0][0].htmlBody).toBe(
      "<p>hi</p><blockquote><p>quoted</p></blockquote>",
    );
  });
});
