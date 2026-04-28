/**
 * Gmail / Google API の SSOT 定数モジュール。
 *
 * 背景: Gmail REST API のエンドポイント URL、システムラベル ID、Smart Inbox
 * カテゴリ ↔ Gmail ラベル のマッピングを一箇所に集約する。
 * 同じリテラルが adapter / scheduler / store に散らばると、文字列の typo が
 * 型レベルで検出されず、URL 変更にも追従できなくなるため。
 *
 * Schema による runtime validation が必要なものだけ Schema を export する
 * （現状: SmartCategorySchema のみ）。GmailSystemLabel は内部リテラル参照のみ
 * のため const + 型派生で十分。
 *
 * 参照: spec §6.4, §6.5 / .claude/rules/robustness.md（Literal + ts-pattern）
 */
import { Schema } from "@effect/schema";
import { match, P } from "ts-pattern";

// ─── Google OAuth / OpenID エンドポイント ───

/** Google OAuth 2.0 認可エンドポイント */
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** Google OAuth 2.0 トークン交換 / refresh エンドポイント */
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Google OAuth 2.0 tokeninfo（id_token 検証）エンドポイント */
export const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

/** Google OAuth UserInfo エンドポイント（プロフィール取得） */
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// ─── Gmail REST API v1 ───

/** Gmail REST API v1 のベース URL（user = me） */
export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Gmail watch（Pub/Sub プッシュ通知登録）エンドポイント */
export const GMAIL_WATCH_URL = `${GMAIL_API_BASE}/watch` as const;

// ─── Gmail システムラベル ───

/**
 * Gmail のシステムラベル ID（Gmail API のプロトコル定数）。
 *
 * 背景: 文字列リテラルが adapter / scheduler / store / hook に散らばると、
 * typo が型レベルで検出できず、ID の意味が暗黙化する。`GmailSystemLabel.UNREAD`
 * のように key を介して Gmail の文字列 ID を参照することで、キー側 typo を
 * コンパイル時に検出する。
 *
 * 制約: `as const` はリテラル型を固定するためで、key と value の一致 (例えば
 * `UNREAD: "UNREAD"`) は型レベルで強制されない。値側 typo (例: `UNREAD: "UNRED"`)
 * は __tests__/gmail-constants.test.ts の "key === value" runtime テストで担保する。
 *
 * 参照: https://developers.google.com/gmail/api/guides/labels#types_of_labels
 */
export const GmailSystemLabel = {
  // メールボックス系
  INBOX: "INBOX",
  SENT: "SENT",
  DRAFT: "DRAFT",
  TRASH: "TRASH",
  SPAM: "SPAM",
  // 状態系
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  // 自動分類カテゴリ
  CATEGORY_PERSONAL: "CATEGORY_PERSONAL",
  CATEGORY_SOCIAL: "CATEGORY_SOCIAL",
  CATEGORY_PROMOTIONS: "CATEGORY_PROMOTIONS",
  CATEGORY_UPDATES: "CATEGORY_UPDATES",
  CATEGORY_FORUMS: "CATEGORY_FORUMS",
} as const;

export type GmailSystemLabel = (typeof GmailSystemLabel)[keyof typeof GmailSystemLabel];

// ─── Smart Inbox カテゴリ ───

/**
 * Smart Inbox のカテゴリフィルタ。
 * - "all": フィルタなし（全件表示）
 * - "people": 人からのメール（CATEGORY_PERSONAL / IMPORTANT）
 * - "notifications": 通知系（CATEGORY_UPDATES / CATEGORY_SOCIAL）
 * - "newsletters": ニュースレター・広告（CATEGORY_PROMOTIONS / CATEGORY_FORUMS）
 */
export const SmartCategorySchema = Schema.Literal("all", "people", "notifications", "newsletters");

export type SmartCategory = typeof SmartCategorySchema.Type;

/**
 * SmartCategory → Gmail システムラベル の対応関係（SSOT）。
 *
 * Smart Inbox のフィルタ条件はここを更新するだけで UI / ストア両方に反映される。
 * "all"（フィルタ無効）は意味的にラベル集合を持たないためキーに含めない。
 *
 * `as const satisfies Record<...>` のパターンで:
 *  - `satisfies` がキー欠落 / 過剰を型レベルで検出（`Record<Exclude<...>>` 制約）
 *  - `as const` がリテラル narrow を保ち、`SMART_CATEGORY_LABELS.people` の型が
 *    `readonly ["CATEGORY_PERSONAL", "IMPORTANT"]` のままになる
 *
 * 注釈位置 (`: Record<...>=` 前置) だと値が wide な `ReadonlyArray<GmailSystemLabel>`
 * に widening されてしまうため、後置 `satisfies` を使う。
 */
export const SMART_CATEGORY_LABELS = {
  people: [GmailSystemLabel.CATEGORY_PERSONAL, GmailSystemLabel.IMPORTANT],
  notifications: [GmailSystemLabel.CATEGORY_UPDATES, GmailSystemLabel.CATEGORY_SOCIAL],
  newsletters: [GmailSystemLabel.CATEGORY_PROMOTIONS, GmailSystemLabel.CATEGORY_FORUMS],
} as const satisfies Record<Exclude<SmartCategory, "all">, readonly GmailSystemLabel[]>;

/**
 * スレッドの labelIds が指定 SmartCategory に該当するかを判定する。
 *
 * "all" は常に true。それ以外は SMART_CATEGORY_LABELS のラベルが
 * 1つでも含まれていればマッチ扱い。
 *
 * ts-pattern の `.exhaustive()` で網羅性を保証する。SmartCategory に
 * 新しい値を追加した瞬間にコンパイルエラーで気付ける（`.exhaustive()` を
 * 維持していることが網羅性保証の前提条件であり、`.otherwise()` 等への
 * 書き換えはこの保証を弱める点に注意）。
 *
 * 未知ラベル ID の扱い: Gmail API は user-defined label を含む任意文字列 ID
 * を返す。GmailSystemLabel に存在しないシステムラベル（API 仕様変更や Google
 * の新カテゴリ追加）はこのフィルタで silently skip される（false 判定で
 * UI から消えるだけでログ・通知はない）。新カテゴリ追加に追従するには
 * GmailSystemLabel と SMART_CATEGORY_LABELS の両方を更新すること。
 */
export function matchesSmartCategory(
  labelIds: readonly string[],
  category: SmartCategory,
): boolean {
  return match(category)
    .with("all", () => true)
    .with(P.union("people", "notifications", "newsletters"), (key) => {
      // Set 化で型キャスト不要 + O(1) 検索。ラベル数は小さい (2-3) ので
      // 構築コストは無視できる。`Array.includes` だと
      // `targets: ReadonlyArray<GmailSystemLabel>` と `l: string` の不一致で
      // 型エラーになるため、以前はキャストで回避していた。
      const targets: ReadonlySet<string> = new Set(SMART_CATEGORY_LABELS[key]);
      return labelIds.some((l) => targets.has(l));
    })
    .exhaustive();
}
