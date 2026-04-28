import { describe, it, expect } from "vitest";
import {
  GmailSystemLabel,
  SMART_CATEGORY_LABELS,
  SmartCategorySchema,
  matchesSmartCategory,
  GMAIL_API_BASE,
  GMAIL_WATCH_URL,
  GOOGLE_TOKEN_ENDPOINT,
} from "../gmail-constants.js";

describe("GmailSystemLabel const", () => {
  // GmailSystemLabel は `as const` で固定された key=value マップだが、
  // **値側 typo** (例: `UNREAD: "UNRED"`) は型レベルで強制できない。
  // Gmail API が返す文字列 ID と一致する必要があるため、ランタイムで
  // self-naming 規約を担保する。
  it("値のセルフ命名規約 (key === value) を保証する", () => {
    for (const [key, value] of Object.entries(GmailSystemLabel)) {
      expect(value).toBe(key);
    }
  });
});

describe("SMART_CATEGORY_LABELS", () => {
  it("各カテゴリが GmailSystemLabel の値で構成される", () => {
    const allLabelValues = Object.values(GmailSystemLabel) as readonly string[];
    for (const labels of Object.values(SMART_CATEGORY_LABELS)) {
      for (const label of labels) {
        expect(allLabelValues).toContain(label);
      }
    }
  });

  it("キーが SmartCategorySchema ('all' を除く) のリテラル集合と一致する", () => {
    // 背景: ハードコードされた期待値だと Schema 側の変更に追従しない。
    // SmartCategorySchema.literals から派生させることで SSOT を 1 箇所に
    // 収束させ、SmartCategory に値を追加した際もテストが追従する。
    const expectedKeys = SmartCategorySchema.literals.filter((l) => l !== "all").toSorted();
    expect(Object.keys(SMART_CATEGORY_LABELS).toSorted()).toEqual(expectedKeys);
  });
});

describe("matchesSmartCategory", () => {
  it("'all' は labelIds の中身に関わらず true を返す", () => {
    expect(matchesSmartCategory([], "all")).toBe(true);
    expect(matchesSmartCategory(["RANDOM"], "all")).toBe(true);
  });

  it("'people' は CATEGORY_PERSONAL または IMPORTANT を含むときに true", () => {
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_PERSONAL], "people")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.IMPORTANT], "people")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_SOCIAL], "people")).toBe(false);
    expect(matchesSmartCategory([], "people")).toBe(false);
  });

  it("'notifications' は CATEGORY_UPDATES / CATEGORY_SOCIAL を含むときに true", () => {
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_UPDATES], "notifications")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_SOCIAL], "notifications")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_PERSONAL], "notifications")).toBe(false);
  });

  it("'newsletters' は CATEGORY_PROMOTIONS / CATEGORY_FORUMS を含むときに true", () => {
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_PROMOTIONS], "newsletters")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_FORUMS], "newsletters")).toBe(true);
    expect(matchesSmartCategory([GmailSystemLabel.CATEGORY_UPDATES], "newsletters")).toBe(false);
  });
});

describe("エンドポイント定数", () => {
  // GMAIL_API_BASE 単独の値検証は WHAT 重複なので削除。GMAIL_WATCH_URL の
  // 派生関係テスト (BASE をプレフィクスに持つ) で間接的に値も保護される。
  it("GMAIL_WATCH_URL が GMAIL_API_BASE をプレフィクスとして持つ", () => {
    expect(GMAIL_WATCH_URL.startsWith(GMAIL_API_BASE)).toBe(true);
    expect(GMAIL_WATCH_URL).toBe(`${GMAIL_API_BASE}/watch`);
  });

  it("GOOGLE_TOKEN_ENDPOINT が公式 URL を指す", () => {
    expect(GOOGLE_TOKEN_ENDPOINT).toBe("https://oauth2.googleapis.com/token");
  });
});
