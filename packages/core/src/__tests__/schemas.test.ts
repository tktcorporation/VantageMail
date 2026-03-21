import { describe, it, expect } from "vitest"
import { Schema } from "@effect/schema"
import { Either } from "effect"
import {
  AccountSchema,
  OAuthTokensSchema,
  ThreadSchema,
  MessageSchema,
  OAuthTokenResponseSchema,
} from "../schemas/index.js"

/** decodeEither のヘルパー。成功時は Right、失敗時は Left を返す。 */
function decode<A, I>(schema: Schema.Schema<A, I>, input: unknown) {
  return Schema.decodeUnknownEither(schema)(input)
}

describe("AccountSchema", () => {
  it("有効なAccountデータをデコードできる", () => {
    const input = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "test@gmail.com",
      displayName: "Test User",
      color: "#ff0000",
      unreadCount: 5,
      notificationsEnabled: true,
    }
    const result = decode(AccountSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.email).toBe("test@gmail.com")
      expect(result.right.avatarUrl).toBeUndefined()
    }
  })

  it("optionalフィールド（avatarUrl, signature）を含むデータをデコードできる", () => {
    const input = {
      id: "id-1",
      email: "test@gmail.com",
      displayName: "Test User",
      avatarUrl: "https://example.com/avatar.png",
      color: "#ff0000",
      unreadCount: 0,
      signature: "Best regards",
      notificationsEnabled: false,
    }
    const result = decode(AccountSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.avatarUrl).toBe("https://example.com/avatar.png")
      expect(result.right.signature).toBe("Best regards")
    }
  })

  it("必須フィールドが欠けている場合はデコード失敗", () => {
    const input = {
      id: "id-1",
      // email が欠けている
      displayName: "Test User",
      color: "#ff0000",
      unreadCount: 0,
      notificationsEnabled: true,
    }
    const result = decode(AccountSchema, input)
    expect(Either.isLeft(result)).toBe(true)
  })

  it("フィールドの型が違う場合はデコード失敗", () => {
    const input = {
      id: "id-1",
      email: "test@gmail.com",
      displayName: "Test User",
      color: "#ff0000",
      unreadCount: "not a number", // number であるべき
      notificationsEnabled: true,
    }
    const result = decode(AccountSchema, input)
    expect(Either.isLeft(result)).toBe(true)
  })
})

describe("OAuthTokenResponseSchema", () => {
  it("Google OAuth トークンレスポンス（snake_case）をデコードできる", () => {
    const input = {
      access_token: "ya29.abc123",
      refresh_token: "1//abc456",
      expires_in: 3600,
      scope: "openid https://www.googleapis.com/auth/gmail.modify",
      token_type: "Bearer",
      id_token: "eyJhbGciOiJSUzI1NiJ9...",
    }
    const result = decode(OAuthTokenResponseSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.access_token).toBe("ya29.abc123")
      expect(result.right.refresh_token).toBe("1//abc456")
    }
  })

  it("refresh_token がない場合もデコードできる（トークンリフレッシュ時）", () => {
    const input = {
      access_token: "ya29.abc123",
      expires_in: 3600,
      scope: "openid",
      token_type: "Bearer",
    }
    const result = decode(OAuthTokenResponseSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.refresh_token).toBeUndefined()
    }
  })
})

describe("OAuthTokensSchema", () => {
  it("内部表現のOAuthTokensをデコードできる", () => {
    const input = {
      accessToken: "ya29.abc123",
      refreshToken: "1//abc456",
      expiresAt: Date.now() + 3600 * 1000,
      scope: "openid",
    }
    const result = decode(OAuthTokensSchema, input)
    expect(Either.isRight(result)).toBe(true)
  })
})

describe("ThreadSchema", () => {
  it("有効なThreadデータをデコードできる", () => {
    const now = new Date()
    const input = {
      id: "thread-1",
      accountId: "account-1",
      subject: "Test Subject",
      snippet: "Preview text...",
      lastMessageAt: now,
      participants: ["alice@example.com", "bob@example.com"],
      messageCount: 3,
      labelIds: ["INBOX", "UNREAD"],
      isUnread: true,
      isStarred: false,
      isPinned: false,
    }
    const result = decode(ThreadSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.lastMessageAt).toBeInstanceOf(Date)
      expect(result.right.snoozedUntil).toBeUndefined()
    }
  })

  it("snoozedUntil を含むThreadをデコードできる", () => {
    const now = new Date()
    const snoozeTime = new Date(Date.now() + 60 * 60 * 1000)
    const input = {
      id: "thread-2",
      accountId: "account-1",
      subject: "Snoozed Thread",
      snippet: "...",
      lastMessageAt: now,
      participants: [],
      messageCount: 1,
      labelIds: [],
      isUnread: false,
      isStarred: false,
      snoozedUntil: snoozeTime,
      isPinned: true,
    }
    const result = decode(ThreadSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.snoozedUntil).toBeInstanceOf(Date)
    }
  })
})

describe("MessageSchema", () => {
  it("構造化された from/to/cc を持つMessageをデコードできる", () => {
    const input = {
      id: "msg-1",
      threadId: "thread-1",
      accountId: "account-1",
      from: { name: "Alice", email: "alice@example.com" },
      to: [
        { name: "Bob", email: "bob@example.com" },
        { name: "Charlie", email: "charlie@example.com" },
      ],
      cc: [{ name: "Dave", email: "dave@example.com" }],
      subject: "Hello",
      snippet: "Hi there...",
      bodyHtml: "<p>Hi there</p>",
      bodyText: "Hi there",
      date: new Date(),
      labelIds: ["INBOX"],
      isUnread: true,
      isStarred: false,
      attachments: [
        {
          id: "att-1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 12345,
        },
      ],
    }
    const result = decode(MessageSchema, input)
    expect(Either.isRight(result)).toBe(true)
    if (Either.isRight(result)) {
      expect(result.right.from.name).toBe("Alice")
      expect(result.right.to).toHaveLength(2)
      expect(result.right.cc).toHaveLength(1)
      expect(result.right.attachments).toHaveLength(1)
    }
  })

  it("from が string（非構造化）の場合はデコード失敗", () => {
    const input = {
      id: "msg-1",
      threadId: "thread-1",
      accountId: "account-1",
      from: "alice@example.com", // should be { name, email }
      to: [],
      cc: [],
      subject: "Hello",
      snippet: "...",
      bodyHtml: "",
      bodyText: "",
      date: new Date(),
      labelIds: [],
      isUnread: false,
      isStarred: false,
      attachments: [],
    }
    const result = decode(MessageSchema, input)
    expect(Either.isLeft(result)).toBe(true)
  })
})
