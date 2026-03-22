/**
 * Gmail APIレスポンスをアプリ内の正規化された型に変換するアダプター。
 *
 * 背景: Gmail APIのレスポンスは生のMIME構造を含む複雑な形式。
 * UIコンポーネントが扱いやすい Thread / Message 型に変換する。
 * この変換層により、将来的に別のメールプロバイダ対応が容易になる。
 *
 * 変換自体は純粋関数であり失敗しないため、Effect でラップする必要はない。
 * Schema 版の GmailThread / GmailMessage 型と、旧 types/ の型の両方を受け付ける
 * （構造的に同じ形状のため型互換）。
 */
import type { GmailThread, GmailMessage, GmailMessagePart } from "../schemas/gmail-api.js";
import type { Thread } from "../schemas/thread.js";
import type { Message, Attachment } from "../schemas/message.js";

/**
 * GmailThreadをアプリ内のThread型に変換する。
 *
 * @param gmailThread - Gmail APIから取得したスレッド
 * @param accountId - このスレッドが属するアカウントのID
 */
export function adaptGmailThread(gmailThread: GmailThread, accountId: string): Thread {
  const messages = gmailThread.messages ?? [];
  const latestMessage = messages[messages.length - 1];

  // 参加者（From）のメールアドレスを抽出
  const participants = new Set<string>();
  for (const msg of messages) {
    const from = extractHeader(msg, "From");
    if (from) {
      participants.add(parseEmailAddress(from).name || parseEmailAddress(from).email);
    }
  }

  // ラベルIDは最新メッセージのものを使用
  const labelIds = latestMessage?.labelIds ?? [];

  return {
    id: gmailThread.id,
    accountId,
    subject: extractHeader(latestMessage, "Subject") ?? "(件名なし)",
    snippet: latestMessage?.snippet ?? "",
    lastMessageAt: new Date(Number(latestMessage?.internalDate ?? Date.now())),
    participants: [...participants],
    messageCount: messages.length,
    labelIds: [...labelIds],
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    isPinned: false,
  };
}

/**
 * GmailMessageをアプリ内のMessage型に変換する。
 */
export function adaptGmailMessage(gmailMessage: GmailMessage, accountId: string): Message {
  const from = parseEmailAddress(extractHeader(gmailMessage, "From") ?? "");
  const to = (extractHeader(gmailMessage, "To") ?? "")
    .split(",")
    .map((s) => parseEmailAddress(s.trim()))
    .filter((a) => a.email);
  const cc = (extractHeader(gmailMessage, "Cc") ?? "")
    .split(",")
    .map((s) => parseEmailAddress(s.trim()))
    .filter((a) => a.email);

  const { html, text } = extractBody(gmailMessage.payload);
  const attachments = extractAttachments(gmailMessage.payload);

  return {
    id: gmailMessage.id,
    threadId: gmailMessage.threadId,
    accountId,
    from,
    to,
    cc,
    subject: extractHeader(gmailMessage, "Subject") ?? "(件名なし)",
    snippet: gmailMessage.snippet,
    bodyHtml: html,
    bodyText: text,
    date: new Date(Number(gmailMessage.internalDate)),
    labelIds: [...gmailMessage.labelIds],
    isUnread: gmailMessage.labelIds.includes("UNREAD"),
    isStarred: gmailMessage.labelIds.includes("STARRED"),
    attachments,
  };
}

// ─── ヘルパー関数 ───

/** メッセージヘッダーから値を抽出する */
function extractHeader(message: GmailMessage | undefined, name: string): string | undefined {
  if (!message?.payload?.headers) return undefined;
  const headers = message.payload.headers as ReadonlyArray<{ name: string; value: string }>;
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/**
 * "Display Name <email@example.com>" 形式のメールアドレスをパースする。
 * "email@example.com" のみの形式にも対応。
 */
function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/^["']|["']$/g, ""), email: match[2] };
  }
  const emailOnly = raw.trim();
  return { name: "", email: emailOnly };
}

/**
 * MIMEパートツリーからHTML/テキストボディを抽出する。
 *
 * 背景: Gmail APIはメッセージをMIMEツリー構造で返す。
 * multipart/alternativeの場合はtext/htmlを優先し、
 * なければtext/plainにフォールバックする。
 */
function extractBody(part: GmailMessagePart): { html: string; text: string } {
  let html = "";
  let text = "";

  if (part.mimeType === "text/html" && part.body.data) {
    html = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/plain" && part.body.data) {
    text = decodeBase64Url(part.body.data);
  }

  // 再帰的にサブパートを探索
  if (part.parts) {
    for (const subPart of part.parts) {
      const sub = extractBody(subPart);
      if (sub.html) html = sub.html;
      if (sub.text && !text) text = sub.text;
    }
  }

  return { html, text };
}

/** MIMEパートツリーから添付ファイルのメタデータを抽出する */
function extractAttachments(part: GmailMessagePart): Attachment[] {
  const attachments: Attachment[] = [];

  if (part.filename && part.body.attachmentId) {
    attachments.push({
      id: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      size: part.body.size,
    });
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      attachments.push(...extractAttachments(subPart));
    }
  }

  return attachments;
}

/** Base64url デコード（Gmail APIのbody.dataフォーマット） */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
}
