/**
 * スクリーンショット撮影用のモックデータ。
 *
 * 背景: Playwright スクリーンショットで使う固定のテストデータ。
 * page.route() で API レスポンスとして返す。
 * 各 Smart Inbox カテゴリに振り分けられるよう labelIds を設定している。
 *
 * 将来テストでも再利用可能。
 */

import type { Account, Thread, Message } from "@vantagemail/core";

/** --- アカウント --- */

export const ACCOUNTS: Account[] = [
  {
    id: "acc-alice",
    email: "alice@gmail.com",
    displayName: "Alice Tanaka",
    color: "#4263eb",
    unreadCount: 5,
    notificationsEnabled: true,
  },
  {
    id: "acc-bob",
    email: "bob@outlook.com",
    displayName: "Bob Suzuki",
    color: "#e64980",
    unreadCount: 3,
    notificationsEnabled: true,
  },
];

/** --- スレッド --- */

const now = new Date("2026-03-21T10:00:00Z");
const hours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const days = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

export const THREADS: Thread[] = [
  // ─── 重要 (people) ───
  {
    id: "t1",
    accountId: "acc-alice",
    subject: "プロジェクト進捗レビュー",
    snippet: "今週のスプリントレビューの資料を共有します。特にAPI設計の部分について…",
    lastMessageAt: hours(1),
    participants: ["carol@example.com", "alice@gmail.com"],
    messageCount: 3,
    labelIds: ["INBOX", "CATEGORY_PERSONAL", "IMPORTANT"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "t2",
    accountId: "acc-alice",
    subject: "チームミーティング議事録",
    snippet: "本日の議題: 1. リリーススケジュール 2. 新機能の優先度 3. バグ修正の…",
    lastMessageAt: hours(4),
    participants: ["dave@example.com", "alice@gmail.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_PERSONAL"],
    isUnread: false,
    isStarred: true,
    isPinned: false,
  },
  {
    id: "t3",
    accountId: "acc-bob",
    subject: "契約書の確認依頼",
    snippet: "添付の契約書をご確認ください。修正箇所は赤字でマークしてあります…",
    lastMessageAt: days(1),
    participants: ["legal@example.com", "bob@outlook.com"],
    messageCount: 2,
    labelIds: ["INBOX", "IMPORTANT"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },

  // ─── 通知 (notifications) ───
  {
    id: "t4",
    accountId: "acc-alice",
    subject: "[GitHub] Pull Request #42 needs review",
    snippet: "tktcorporation requested your review on feat: add email composer...",
    lastMessageAt: hours(2),
    participants: ["notifications@github.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "t5",
    accountId: "acc-alice",
    subject: "Slack: #engineering に新しいメッセージ",
    snippet: "デプロイパイプラインの改善について議論が始まりました…",
    lastMessageAt: hours(5),
    participants: ["notification@slack.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_SOCIAL"],
    isUnread: false,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "t6",
    accountId: "acc-bob",
    subject: "Google Calendar: 週次1on1リマインダー",
    snippet: "明日 14:00-14:30 の 1on1 ミーティングのリマインダーです…",
    lastMessageAt: hours(8),
    participants: ["calendar-notification@google.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },

  // ─── ニュースレター (newsletters) ───
  {
    id: "t7",
    accountId: "acc-alice",
    subject: "This Week in React #215",
    snippet: "React 20 の新機能、Server Components のベストプラクティス、注目のライブラリ…",
    lastMessageAt: days(1),
    participants: ["newsletter@thisweekinreact.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    isUnread: false,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "t8",
    accountId: "acc-bob",
    subject: "Hacker News Digest - 2026/03/20",
    snippet: "今日のトップ: AI駆動の開発ツール、Rustの新しいGCアルゴリズム…",
    lastMessageAt: days(1),
    participants: ["digest@hackernews.com"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_FORUMS"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
];

/** --- メッセージ（スレッド詳細表示用） --- */

export const MESSAGES_BY_THREAD: Record<string, Message[]> = {
  t1: [
    {
      id: "m1-1",
      threadId: "t1",
      accountId: "acc-alice",
      from: { name: "Carol Yamada", email: "carol@example.com" },
      to: [{ name: "Alice Tanaka", email: "alice@gmail.com" }],
      cc: [],
      subject: "プロジェクト進捗レビュー",
      snippet: "今週のスプリントレビューの資料を共有します。",
      bodyHtml: `
        <p>Alice さん</p>
        <p>今週のスプリントレビューの資料を共有します。</p>
        <p>特にAPI設計の部分について、以下のポイントを確認してほしいです：</p>
        <ul>
          <li>エンドポイントの命名規則</li>
          <li>エラーレスポンスの統一フォーマット</li>
          <li>認証フローの簡略化</li>
        </ul>
        <p>来週のスプリントプランニングまでにフィードバックをもらえると助かります。</p>
        <p>よろしくお願いします。<br/>Carol</p>
      `,
      bodyText: "今週のスプリントレビューの資料を共有します。",
      date: hours(3),
      labelIds: ["INBOX"],
      isUnread: false,
      isStarred: false,
      attachments: [
        {
          id: "att-1",
          filename: "sprint-review-w12.pdf",
          mimeType: "application/pdf",
          size: 245760,
        },
      ],
    },
    {
      id: "m1-2",
      threadId: "t1",
      accountId: "acc-alice",
      from: { name: "Alice Tanaka", email: "alice@gmail.com" },
      to: [{ name: "Carol Yamada", email: "carol@example.com" }],
      cc: [],
      subject: "Re: プロジェクト進捗レビュー",
      snippet: "確認しました。API設計について気になった点があります。",
      bodyHtml: `
        <p>Carol さん</p>
        <p>資料確認しました。API設計について気になった点があります：</p>
        <p>エラーレスポンスは RFC 7807 (Problem Details) に準拠するのはどうでしょうか？</p>
        <p>Alice</p>
      `,
      bodyText: "確認しました。API設計について気になった点があります。",
      date: hours(2),
      labelIds: ["INBOX"],
      isUnread: false,
      isStarred: false,
      attachments: [],
    },
    {
      id: "m1-3",
      threadId: "t1",
      accountId: "acc-alice",
      from: { name: "Carol Yamada", email: "carol@example.com" },
      to: [{ name: "Alice Tanaka", email: "alice@gmail.com" }],
      cc: [],
      subject: "Re: Re: プロジェクト進捗レビュー",
      snippet: "いいですね！RFC 7807 で進めましょう。",
      bodyHtml: `
        <p>いいですね！RFC 7807 で進めましょう。</p>
        <p>実装例を共有します。来週のスプリントに含めましょう。</p>
      `,
      bodyText: "いいですね！RFC 7807 で進めましょう。",
      date: hours(1),
      labelIds: ["INBOX"],
      isUnread: true,
      isStarred: false,
      attachments: [],
    },
  ],
};

/**
 * API レスポンス用にスレッドを JSON シリアライズ可能な形に変換する。
 * Date → ISO 文字列に変換する（use-sync.ts の DateFromString デコードに対応）。
 */
export function serializeThreads(threads: Thread[]) {
  return threads.map((t) => ({
    ...t,
    lastMessageAt: t.lastMessageAt.toISOString(),
    snoozedUntil: t.snoozedUntil?.toISOString(),
  }));
}

/**
 * API レスポンス用にメッセージを JSON シリアライズ可能な形に変換する。
 */
export function serializeMessages(messages: Message[]) {
  return messages.map((m) => ({
    ...m,
    date: m.date.toISOString(),
  }));
}
