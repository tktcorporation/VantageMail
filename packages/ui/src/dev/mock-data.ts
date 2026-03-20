/**
 * 開発用モックデータ。
 *
 * 背景: Gmail API接続前にUIの動作確認をするためのダミーデータ。
 * 複数アカウント + 複数スレッドのシナリオをシミュレートし、
 * Unified Inboxの表示、アカウント切替、J/Kナビゲーションをテストする。
 * 本番では使用しない。
 */
import type { Account, Thread } from "@vantagemail/core";

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-personal",
    email: "tanaka.yuki@gmail.com",
    displayName: "田中 悠希",
    color: "#228be6",
    unreadCount: 12,
    notificationsEnabled: true,
  },
  {
    id: "acc-work",
    email: "y.tanaka@acme-corp.com",
    displayName: "田中 悠希（ACME）",
    color: "#40c057",
    unreadCount: 5,
    notificationsEnabled: true,
  },
  {
    id: "acc-side",
    email: "yuki@side-project.dev",
    displayName: "Yuki",
    color: "#fab005",
    unreadCount: 2,
    notificationsEnabled: false,
  },
];

const now = Date.now();
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const MOCK_THREADS: Thread[] = [
  {
    id: "thread-1",
    accountId: "acc-work",
    subject: "Q2プロダクトロードマップの最終確認",
    snippet: "来週の全社ミーティングまでにフィードバックをお願いします。特にモバイル対応の優先度について...",
    lastMessageAt: new Date(now - 5 * MINUTE),
    participants: ["佐藤 美咲", "鈴木 拓也", "田中 悠希"],
    messageCount: 4,
    labelIds: ["INBOX", "IMPORTANT"],
    isUnread: true,
    isStarred: true,
    isPinned: true,
  },
  {
    id: "thread-2",
    accountId: "acc-personal",
    subject: "Re: 週末のBBQ場所について",
    snippet: "多摩川の河川敷がいいと思う！前回も良かったし。集合時間はどうする？",
    lastMessageAt: new Date(now - 23 * MINUTE),
    participants: ["山田 太郎", "高橋 さくら"],
    messageCount: 8,
    labelIds: ["INBOX"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "thread-3",
    accountId: "acc-work",
    subject: "【要対応】本番環境のメモリリーク調査",
    snippet: "先ほどアラートが発火しました。Grafanaのダッシュボードを確認したところ、Worker #3のヒープが...",
    lastMessageAt: new Date(now - 1 * HOUR),
    participants: ["山本 健一"],
    messageCount: 2,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "thread-4",
    accountId: "acc-side",
    subject: "GitHub: [side-project] PR #142 merged",
    snippet: "feat: add OAuth callback handler — Successfully merged by yuki into main",
    lastMessageAt: new Date(now - 3 * HOUR),
    participants: ["github-bot"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    isUnread: false,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "thread-5",
    accountId: "acc-personal",
    subject: "Amazonの注文が発送されました",
    snippet: "ご注文の「TypeScript Design Patterns」は明日到着予定です。配送状況の確認は...",
    lastMessageAt: new Date(now - 5 * HOUR),
    participants: ["Amazon.co.jp"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    isUnread: false,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "thread-6",
    accountId: "acc-work",
    subject: "Re: デザインレビュー — ダッシュボードv2",
    snippet: "Figmaのコメントにフィードバック残しました。全体的に良い方向ですが、レスポンシブ対応が...",
    lastMessageAt: new Date(now - 1 * DAY),
    participants: ["渡辺 えり", "小林 一郎"],
    messageCount: 6,
    labelIds: ["INBOX"],
    isUnread: false,
    isStarred: true,
    isPinned: false,
  },
  {
    id: "thread-7",
    accountId: "acc-personal",
    subject: "確定申告の書類について",
    snippet: "先日ご依頼いただいた源泉徴収票のコピーを添付します。ご確認ください。",
    lastMessageAt: new Date(now - 2 * DAY),
    participants: ["税理士法人ABC"],
    messageCount: 3,
    labelIds: ["INBOX", "IMPORTANT"],
    isUnread: true,
    isStarred: false,
    isPinned: false,
  },
  {
    id: "thread-8",
    accountId: "acc-side",
    subject: "Newsletter: This Week in Rust #547",
    snippet: "This week's crate is axum-otel, a middleware for automatic OpenTelemetry instrumentation...",
    lastMessageAt: new Date(now - 3 * DAY),
    participants: ["This Week in Rust"],
    messageCount: 1,
    labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    isUnread: false,
    isStarred: false,
    isPinned: false,
  },
];
