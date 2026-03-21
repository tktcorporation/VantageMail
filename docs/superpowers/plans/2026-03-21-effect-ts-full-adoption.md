# Effect-TS 全面導入 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VantageMail の全コードベースを Effect-TS で書き換え、型安全なエラーハンドリング・依存性注入・リトライポリシーを実現する

**Architecture:** Effect の Service/Layer パターンで DI を構築。Cloudflare Workers の env はリクエストスコープで Layer 化。全エラーを `Data.TaggedError` で型付け。`@effect/schema` で API レスポンス/DB 行のバリデーション。Zustand store は維持しつつ非同期アクションを Effect 化。

**Tech Stack:** effect, @effect/schema, @effect/eslint-plugin, oxlint, vitest, vite-plus (vp)

---

## Task 1: Effect パッケージ導入 + OxLint 設定

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/core/package.json`
- Modify: `apps/web/package.json`
- Modify: `workers/package.json` (if exists, else create)
- Modify: `packages/ui/package.json`
- Modify: `packages/core/tsconfig.json`
- Create: `.oxlintrc.json`

- [ ] **Step 1: Effect パッケージをインストール**

```bash
pnpm add -w effect @effect/schema
pnpm add -D -w @effect/eslint-plugin oxlint
```

- [ ] **Step 2: packages/core の tsconfig.json を更新**

`exactOptionalPropertyTypes: true` と `strict: true` は既にある。
Effect が推奨する設定を追加:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: OxLint 設定ファイルを作成**

```jsonc
// .oxlintrc.json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "jsPlugins": ["@effect/eslint-plugin"],
  "rules": {}
}
```

- [ ] **Step 4: typecheck + build が通ることを確認**

```bash
pnpm run typecheck
pnpm run build
```

- [ ] **Step 5: コミット**

```bash
jj describe -m "chore: Effect-TS + OxLint パッケージ導入"
```

---

## Task 2: エラー型 + Schema 定義 (packages/core)

**Files:**
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/schemas/account.ts`
- Create: `packages/core/src/schemas/thread.ts`
- Create: `packages/core/src/schemas/message.ts`
- Create: `packages/core/src/schemas/gmail-api.ts`
- Create: `packages/core/src/schemas/index.ts`
- Modify: `packages/core/src/types/account.ts` — 型を Schema から derive するよう変更
- Modify: `packages/core/src/types/gmail.ts` — 型を Schema から derive するよう変更
- Modify: `packages/core/src/index.ts` — re-export 追加
- Test: `packages/core/src/__tests__/schemas.test.ts`

- [ ] **Step 1: エラー型を定義**

```typescript
// packages/core/src/errors.ts
import { Data } from "effect"

// --- Auth / OAuth ---
export class TokenExchangeError extends Data.TaggedError("TokenExchangeError")<{
  readonly status: number
  readonly details: string
}> {}

export class RefreshTokenMissing extends Data.TaggedError("RefreshTokenMissing")<{}> {}

export class GoogleSubExtractionError extends Data.TaggedError("GoogleSubExtractionError")<{
  readonly reason: string
}> {}

export class SessionError extends Data.TaggedError("SessionError")<{
  readonly reason: string
}> {}

export class NotAuthenticated extends Data.TaggedError("NotAuthenticated")<{}> {}

// --- Crypto ---
export class DecryptionError extends Data.TaggedError("DecryptionError")<{
  readonly reason: string
}> {}

export class EncryptionError extends Data.TaggedError("EncryptionError")<{
  readonly reason: string
}> {}

export class KeyDerivationError extends Data.TaggedError("KeyDerivationError")<{
  readonly reason: string
}> {}

// --- Database ---
export class DbQueryError extends Data.TaggedError("DbQueryError")<{
  readonly query: string
  readonly reason: string
}> {}

export class DbNotFoundError extends Data.TaggedError("DbNotFoundError")<{
  readonly table: string
  readonly key: string
}> {}

// --- Gmail API ---
export class GmailApiError extends Data.TaggedError("GmailApiError")<{
  readonly status: number
  readonly path: string
  readonly body: string
}> {}

// --- Config ---
export class ConfigMissingError extends Data.TaggedError("ConfigMissingError")<{
  readonly key: string
}> {}

// 集約型 — API ルートの catchAll で使う
export type AuthError =
  | TokenExchangeError
  | RefreshTokenMissing
  | GoogleSubExtractionError
  | SessionError
  | NotAuthenticated
  | DecryptionError
  | KeyDerivationError
  | DbQueryError
  | DbNotFoundError
```

- [ ] **Step 2: Account / Thread / Message の Schema を定義**

```typescript
// packages/core/src/schemas/account.ts
import { Schema } from "effect"

export const AccountSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
  avatarUrl: Schema.optional(Schema.String),
  color: Schema.String,
  unreadCount: Schema.Number,
  signature: Schema.optional(Schema.String),
  notificationsEnabled: Schema.Boolean,
})

export type Account = typeof AccountSchema.Type

// DB 行の Schema
export const UserRowSchema = Schema.Struct({
  id: Schema.String,
  google_sub: Schema.String,
  email: Schema.String,
  display_name: Schema.String,
  avatar_url: Schema.NullOr(Schema.String),
  encrypted_dek: Schema.String,
  dek_iv: Schema.String,
  created_at: Schema.Number,
  updated_at: Schema.Number,
})

export type UserRow = typeof UserRowSchema.Type

export const LinkedAccountRowSchema = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  email: Schema.String,
  google_sub: Schema.String,
  display_name: Schema.String,
  avatar_url: Schema.NullOr(Schema.String),
  color: Schema.String,
  encrypted_refresh_token: Schema.String,
  refresh_token_iv: Schema.String,
  token_scope: Schema.String,
  created_at: Schema.Number,
  updated_at: Schema.Number,
})

export type LinkedAccountRow = typeof LinkedAccountRowSchema.Type
```

```typescript
// packages/core/src/schemas/thread.ts
import { Schema } from "effect"

export const ThreadSchema = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  participants: Schema.Array(Schema.String),
  messageCount: Schema.Number,
  lastMessageAt: Schema.DateFromSelf,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  snoozedUntil: Schema.optional(Schema.DateFromSelf),
  isPinned: Schema.Boolean,
})

export type Thread = typeof ThreadSchema.Type
```

```typescript
// packages/core/src/schemas/message.ts
import { Schema } from "effect"

export const AttachmentSchema = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
})

export type Attachment = typeof AttachmentSchema.Type

const EmailAddressSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
})

export const MessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  accountId: Schema.String,
  from: EmailAddressSchema,
  to: Schema.Array(EmailAddressSchema),
  cc: Schema.Array(EmailAddressSchema),
  subject: Schema.String,
  snippet: Schema.String,
  bodyHtml: Schema.String,
  bodyText: Schema.String,
  date: Schema.DateFromSelf,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  attachments: Schema.Array(AttachmentSchema),
})

export type Message = typeof MessageSchema.Type
```

```typescript
// packages/core/src/schemas/gmail-api.ts
import { Schema } from "effect"

export const GmailHeaderSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
})

export const GmailMessagePartSchema: Schema.Schema<GmailMessagePart> = Schema.Struct({
  partId: Schema.String,
  mimeType: Schema.String,
  filename: Schema.String,
  headers: Schema.Array(GmailHeaderSchema),
  body: Schema.Struct({
    size: Schema.Number,
    data: Schema.optional(Schema.String),
    attachmentId: Schema.optional(Schema.String),
  }),
  parts: Schema.optional(Schema.Array(Schema.suspend(() => GmailMessagePartSchema))),
})

// 再帰型のために手動型定義（既存 GmailMessagePart と一致させる）
interface GmailMessagePart {
  partId: string
  mimeType: string
  filename: string
  headers: Array<{ name: string; value: string }>
  body: { size: number; data?: string; attachmentId?: string }
  parts?: GmailMessagePart[]
}

export const GmailMessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  labelIds: Schema.Array(Schema.String),
  snippet: Schema.String,
  payload: GmailMessagePartSchema,
  sizeEstimate: Schema.Number,
  historyId: Schema.String,
  internalDate: Schema.String,
})

export type GmailMessage = typeof GmailMessageSchema.Type

export const GmailThreadSchema = Schema.Struct({
  id: Schema.String,
  historyId: Schema.String,
  messages: Schema.Array(GmailMessageSchema),
})

export const GmailThreadListResponseSchema = Schema.Struct({
  threads: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    historyId: Schema.optional(Schema.String),
    snippet: Schema.optional(Schema.String),
  }))),
  nextPageToken: Schema.optional(Schema.String),
  resultSizeEstimate: Schema.optional(Schema.Number),
})

export const GmailMessageListResponseSchema = Schema.Struct({
  messages: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    threadId: Schema.String,
  }))),
  nextPageToken: Schema.optional(Schema.String),
})

export const OAuthTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  scope: Schema.String,
  token_type: Schema.String,
  id_token: Schema.optional(Schema.String),
})

export type OAuthTokenResponse = typeof OAuthTokenResponseSchema.Type

export const GoogleUserInfoSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  verified_email: Schema.optional(Schema.Boolean),
  name: Schema.String,
  picture: Schema.optional(Schema.String),
})

export type GoogleUserInfo = typeof GoogleUserInfoSchema.Type
```

```typescript
// packages/core/src/schemas/index.ts
export * from "./account.js"
export * from "./thread.js"
export * from "./message.js"
export * from "./gmail-api.js"
```

- [ ] **Step 3: 既存の types/ を Schema から derive するよう変更**

`packages/core/src/types/account.ts` と `types/gmail.ts` を Schema ベースの re-export に変更。
既存の消費者が `import type { Account } from "@vantagemail/core"` で引き続き使えるようにする。

- [ ] **Step 4: index.ts を更新**

```typescript
// packages/core/src/index.ts
export * from "./schemas/index.js"
export * from "./errors.js"
export * from "./stores/accounts.js"
export * from "./stores/threads.js"
export * from "./gmail/client.js"
export * from "./gmail/adapter.js"
export * from "./gmail/sync.js"
```

- [ ] **Step 5: Schema のテストを書く**

```typescript
// packages/core/src/__tests__/schemas.test.ts
import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { AccountSchema, ThreadSchema, OAuthTokenResponseSchema } from "../schemas/index.js"

describe("Schema", () => {
  it("Account: 有効なデータを decode できる", () => {
    const result = Schema.decodeUnknownSync(AccountSchema)({
      id: "acc-1",
      email: "test@gmail.com",
      displayName: "Test",
      avatarUrl: null,
      color: "#228be6",
      unreadCount: 0,
      notificationsEnabled: true,
    })
    expect(result.email).toBe("test@gmail.com")
  })

  it("Account: 不正なデータで ParseError が発生する", () => {
    expect(() =>
      Schema.decodeUnknownSync(AccountSchema)({ id: 123 })
    ).toThrow()
  })

  it("OAuthTokenResponse: Google のレスポンスを decode できる", () => {
    const result = Schema.decodeUnknownSync(OAuthTokenResponseSchema)({
      access_token: "ya29.xxx",
      expires_in: 3600,
      scope: "openid email",
      token_type: "Bearer",
      id_token: "eyJ...",
    })
    expect(result.access_token).toBe("ya29.xxx")
  })
})
```

- [ ] **Step 6: テスト実行 + typecheck**

```bash
pnpm run typecheck
pnpm --filter @vantagemail/core run test
```

- [ ] **Step 7: コミット**

```bash
jj describe -m "feat: Effect Schema + エラー型定義"
```

---

## Task 3: Service 定義 + Layer (apps/web)

**Files:**
- Create: `apps/web/src/lib/services/D1Service.ts`
- Create: `apps/web/src/lib/services/CryptoService.ts`
- Create: `apps/web/src/lib/services/SessionService.ts`
- Create: `apps/web/src/lib/services/ConfigService.ts`
- Create: `apps/web/src/lib/services/index.ts`
- Create: `apps/web/src/lib/runtime.ts`
- Modify: `apps/web/src/lib/db.ts` — Effect ベースに書き換え
- Modify: `apps/web/src/lib/crypto.ts` — Effect ベースに書き換え
- Modify: `apps/web/src/lib/session.ts` — Effect ベースに書き換え

- [ ] **Step 1: D1Service を定義**

D1Database バインディングを Effect Service として wrap。
Cloudflare が env をリクエスト時に渡すため、`Layer.succeed` でリクエストごとに構築する。

```typescript
// apps/web/src/lib/services/D1Service.ts
import { Context, Effect, Layer } from "effect"

export class D1Service extends Context.Tag("D1Service")<
  D1Service,
  D1Database
>() {
  static layer = (db: D1Database) => Layer.succeed(D1Service, db)
}
```

- [ ] **Step 2: CryptoService を定義**

既存の `crypto.ts` の関数群を Service 化。
全関数を `Effect.tryPromise` で wrap し、エラーを型付け。

```typescript
// apps/web/src/lib/services/CryptoService.ts
import { Context, Effect, Layer } from "effect"
import { DecryptionError, EncryptionError, KeyDerivationError } from "@vantagemail/core"

export interface CryptoServiceImpl {
  deriveKEK: (serverSecret: string, googleSub: string) => Effect.Effect<CryptoKey, KeyDerivationError>
  generateDEK: () => Uint8Array
  encryptDEK: (kek: CryptoKey, dek: Uint8Array) => Effect.Effect<EncryptedData, EncryptionError>
  decryptDEK: (kek: CryptoKey, data: EncryptedData) => Effect.Effect<Uint8Array, DecryptionError>
  importDEK: (dekBytes: Uint8Array) => Effect.Effect<CryptoKey, KeyDerivationError>
  encrypt: (key: CryptoKey, plaintext: string) => Effect.Effect<EncryptedData, EncryptionError>
  decrypt: (key: CryptoKey, data: EncryptedData) => Effect.Effect<string, DecryptionError>
}

export class CryptoService extends Context.Tag("CryptoService")<
  CryptoService,
  CryptoServiceImpl
>() {
  static live = Layer.succeed(CryptoService, { /* 既存 crypto.ts 関数を Effect.tryPromise で wrap */ })
}
```

- [ ] **Step 3: SessionService を定義**

```typescript
// apps/web/src/lib/services/SessionService.ts
import { Context, Effect, Layer } from "effect"
import { SessionError, NotAuthenticated } from "@vantagemail/core"

export interface AppSessionData {
  userId?: string
  dek?: string
  codeVerifier?: string
  accessTokenCache?: Record<string, { accessToken: string; expiresAt: number }>
}

export interface SessionServiceImpl {
  get: () => Effect.Effect<AppSessionData, SessionError>
  update: (fn: (prev: AppSessionData) => AppSessionData) => Effect.Effect<void, SessionError>
  clear: () => Effect.Effect<void, SessionError>
  requireAuth: () => Effect.Effect<{ userId: string; dek: string }, NotAuthenticated>
}

export class SessionService extends Context.Tag("SessionService")<
  SessionService,
  SessionServiceImpl
>() {}
```

- [ ] **Step 4: ConfigService を定義**

```typescript
// apps/web/src/lib/services/ConfigService.ts
import { Context, Effect, Layer } from "effect"
import { ConfigMissingError } from "@vantagemail/core"

export interface AppConfig {
  googleClientId: string
  googleClientSecret: string
  serverSecret: string
  allowedOrigins: string[]
}

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  AppConfig
>() {
  static layer = (env: Record<string, unknown>) =>
    Layer.effect(
      ConfigService,
      Effect.gen(function* () {
        const get = (key: string) =>
          typeof env[key] === "string"
            ? Effect.succeed(env[key] as string)
            : Effect.fail(new ConfigMissingError({ key }))

        return {
          googleClientId: yield* get("GOOGLE_CLIENT_ID"),
          googleClientSecret: yield* get("GOOGLE_CLIENT_SECRET"),
          serverSecret: yield* get("SERVER_SECRET"),
          allowedOrigins: (yield* get("ALLOWED_ORIGINS")).split(","),
        }
      })
    )
}
```

- [ ] **Step 5: runtime.ts — リクエストスコープの Layer 合成**

```typescript
// apps/web/src/lib/runtime.ts
import { Layer, ManagedRuntime, Effect } from "effect"
import { D1Service } from "./services/D1Service.js"
import { CryptoService } from "./services/CryptoService.js"
import { SessionService } from "./services/SessionService.js"
import { ConfigService } from "./services/ConfigService.js"

export type AppServices = D1Service | CryptoService | SessionService | ConfigService

/**
 * リクエストスコープの Layer を構築する。
 * Cloudflare Workers は env をリクエスト時に渡すため、Layer もリクエストごとに作る。
 */
export const makeAppLayer = (env: CloudflareEnv) =>
  Layer.mergeAll(
    D1Service.layer(env.DB),
    CryptoService.live,
    SessionService.live(/* session config from env */),
    ConfigService.layer(env),
  )

/**
 * Effect を実行して Response を返す API ルートヘルパー。
 * エラーは JSON レスポンスに変換する。
 */
export const handleEffect = <E>(
  effect: Effect.Effect<Response, E, AppServices>,
  env: CloudflareEnv,
): Promise<Response> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(makeAppLayer(env)),
      Effect.catchAll((error) =>
        Effect.succeed(
          Response.json(
            { error: (error as { _tag?: string })._tag ?? "InternalError" },
            { status: 500 },
          )
        )
      ),
    )
  )
```

- [ ] **Step 6: db.ts を Effect ベースに書き換え**

既存の関数を D1Service を使う Effect に変換:

```typescript
// apps/web/src/lib/db.ts
import { Effect } from "effect"
import { D1Service } from "./services/D1Service.js"
import { DbQueryError, DbNotFoundError } from "@vantagemail/core"
import type { UserRow, LinkedAccountRow } from "@vantagemail/core"

export const findUserByGoogleSub = (googleSub: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const row = yield* Effect.tryPromise({
      try: () =>
        db.prepare("SELECT * FROM users WHERE google_sub = ?")
          .bind(googleSub)
          .first<UserRow>(),
      catch: (e) => new DbQueryError({ query: "findUserByGoogleSub", reason: String(e) }),
    })
    if (!row) return yield* Effect.fail(new DbNotFoundError({ table: "users", key: googleSub }))
    return row
  })

export const findLinkedAccountsByUserId = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const result = yield* Effect.tryPromise({
      try: () =>
        db.prepare("SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY created_at")
          .bind(userId)
          .all<LinkedAccountRow>(),
      catch: (e) => new DbQueryError({ query: "findLinkedAccountsByUserId", reason: String(e) }),
    })
    return result.results ?? []
  })

// createUser, createLinkedAccount, deleteLinkedAccount, updateLinkedAccount も同様に変換
// 新規追加: findLinkedAccountById (gmail-server.ts のトークン復号で使用)
export const findLinkedAccountById = (accountId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const row = yield* Effect.tryPromise({
      try: () =>
        db.prepare("SELECT * FROM linked_accounts WHERE id = ?")
          .bind(accountId)
          .first<LinkedAccountRow>(),
      catch: (e) => new DbQueryError({ query: "findLinkedAccountById", reason: String(e) }),
    })
    if (!row) return yield* Effect.fail(new DbNotFoundError({ table: "linked_accounts", key: accountId }))
    return row
  })
```

- [ ] **Step 7: crypto.ts を Effect ベースに書き換え**

```typescript
// apps/web/src/lib/crypto.ts
import { Effect } from "effect"
import { DecryptionError, EncryptionError, KeyDerivationError } from "@vantagemail/core"

export const deriveKEK = (serverSecret: string, googleSub: string) =>
  Effect.tryPromise({
    try: async () => {
      const encoder = new TextEncoder()
      const keyMaterial = await crypto.subtle.importKey(
        "raw", encoder.encode(serverSecret), "HKDF", false, ["deriveKey"]
      )
      // salt/info の順序は既存 crypto.ts と完全に一致させること（逆にすると既存データが復号不能になる）
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: encoder.encode("vantagemail-kek"), info: encoder.encode(googleSub) },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      )
    },
    catch: (e) => new KeyDerivationError({ reason: String(e) }),
  })

// encrypt, decrypt, encryptDEK, decryptDEK, generateDEK, importDEK も同様
```

- [ ] **Step 8: typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 9: コミット**

```bash
jj describe -m "feat: Effect Service/Layer 定義 + DB/Crypto 層の Effect 化"
```

---

## Task 4: Gmail API クライアント Effect 化 (packages/core)

**Files:**
- Modify: `packages/core/src/gmail/client.ts` — Effect ベースに全面書き換え
- Modify: `packages/core/src/gmail/adapter.ts` — Effect ベースに変換
- Modify: `packages/core/src/gmail/sync.ts` — Effect ベースに変換
- Modify: `packages/core/src/gmail/oauth.ts` — Effect ベースに変換 (フロントエンド用関数)
- Test: `packages/core/src/__tests__/gmail-client.test.ts`

- [ ] **Step 1: GmailClient を Effect Service として再定義**

```typescript
// packages/core/src/gmail/client.ts
import { Context, Effect, Schedule, Schema } from "effect"
import { GmailApiError } from "../errors.js"

export interface GmailClientImpl {
  request: <T>(path: string, schema: Schema.Schema<T>, options?: RequestInit) => Effect.Effect<T, GmailApiError>
}

export class GmailClient extends Context.Tag("GmailClient")<
  GmailClient,
  GmailClientImpl
>() {}

// リトライポリシー: 429 で指数バックオフ (最大3回, 1s→2s→4s)
const retryPolicy = Schedule.exponential("1 second").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput((err: GmailApiError) => err.status === 429),
)

export const makeGmailClient = (accessToken: string): GmailClientImpl => ({
  request: <T>(path: string, schema: Schema.Schema<T>, options: RequestInit = {}) =>
    Effect.tryPromise({
      try: () =>
        fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
          ...options,
          headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
        }),
      catch: (e) => new GmailApiError({ status: 0, path, body: String(e) }),
    }).pipe(
      Effect.flatMap((res) =>
        res.ok
          ? Effect.tryPromise({
              try: () => res.json(),
              catch: (e) => new GmailApiError({ status: res.status, path, body: String(e) }),
            })
          : Effect.tryPromise({
              try: () => res.text(),
              catch: () => new GmailApiError({ status: res.status, path, body: "" }),
            }).pipe(
              Effect.flatMap((body) =>
                Effect.fail(new GmailApiError({ status: res.status, path, body }))
              ),
            )
      ),
      Effect.flatMap((json) =>
        Schema.decodeUnknown(schema)(json).pipe(
          Effect.mapError((e) => new GmailApiError({ status: 0, path, body: String(e) })),
        )
      ),
      Effect.retry(retryPolicy),
    ),
})
```

- [ ] **Step 2: adapter.ts を Effect 化**

Gmail API レスポンス → アプリ内型の変換を Effect パイプラインに。
`decodeBase64Url` などの純粋関数はそのまま維持。

- [ ] **Step 3: sync.ts を Effect 化**

```typescript
export const syncThreads = (accountId: string) =>
  Effect.gen(function* () {
    const gmail = yield* GmailClient
    const threadList = yield* gmail.request(
      "/users/me/threads?maxResults=50",
      GmailThreadListResponseSchema,
    )
    // ... adapt to Thread[]
  })
```

- [ ] **Step 4: oauth.ts のフロントエンド用関数を Effect 化**

PKCE 生成、トークン交換関数を `Effect.tryPromise` ベースに。

- [ ] **Step 5: テストを書く**

```typescript
// packages/core/src/__tests__/gmail-client.test.ts
import { describe, it, expect, vi } from "vitest"
import { Effect, Layer } from "effect"
import { GmailClient, makeGmailClient } from "../gmail/client.js"
import { GmailApiError } from "../errors.js"

describe("GmailClient", () => {
  it("正常レスポンスを decode できる", async () => {
    // fetch をモックして正常レスポンスを返す
    // Effect.runPromise で実行
  })

  it("401 で GmailApiError が発生する", async () => {
    // 401 レスポンスをモックして GmailApiError を期待
  })

  it("429 でリトライする", async () => {
    // 1回目 429、2回目 200 をモックして成功を期待
  })
})
```

- [ ] **Step 6: typecheck + テスト実行**

```bash
pnpm run typecheck
pnpm --filter @vantagemail/core run test
```

- [ ] **Step 7: コミット**

```bash
jj describe -m "feat: Gmail API クライアントを Effect 化 (リトライ/Schema decode 内蔵)"
```

---

## Task 5: OAuth コールバック + API ルート Effect 化 (apps/web)

**Files:**
- Modify: `apps/web/src/routes/oauth/callback.tsx` — 全面書き換え
- Modify: `apps/web/src/routes/api/auth/start.ts` — Effect 化
- Modify: `apps/web/src/routes/api/auth/logout.ts` — Effect 化
- Modify: `apps/web/src/routes/api/accounts/index.ts` — Effect 化
- Modify: `apps/web/src/routes/api/threads/index.ts` — Effect 化
- Modify: `apps/web/src/routes/api/threads/$threadId.ts` — Effect 化
- Modify: `apps/web/src/lib/gmail-server.ts` — Effect 化
- Modify: `apps/web/src/routes/index.tsx` — loader を Effect 化

- [ ] **Step 1: gmail-server.ts を Effect 化**

```typescript
// apps/web/src/lib/gmail-server.ts
import { Effect } from "effect"
import { GmailClient, makeGmailClient } from "@vantagemail/core"
import { D1Service } from "./services/D1Service.js"
import { CryptoService } from "./services/CryptoService.js"
import { SessionService } from "./services/SessionService.js"

/**
 * セッションから access_token を取得し、期限切れなら refresh する。
 * Effect パイプラインで暗号化→DB→Google API の複雑なフローを表現。
 */
export const getGmailClient = (accountId: string) =>
  Effect.gen(function* () {
    const session = yield* SessionService
    const { userId, dek } = yield* session.requireAuth()
    const crypto = yield* CryptoService
    const db = yield* D1Service

    // access_token キャッシュチェック → 期限切れなら refresh_token で更新
    const sessionData = yield* session.get()
    const cached = sessionData.accessTokenCache?.[accountId]

    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return makeGmailClient(cached.accessToken)
    }

    // DB から refresh_token を取得して復号
    const account = yield* findLinkedAccountById(accountId)
    const dekKey = yield* crypto.importDEK(base64ToUint8(dek))
    const refreshToken = yield* crypto.decrypt(dekKey, {
      ciphertext: account.encrypted_refresh_token,
      iv: account.refresh_token_iv,
    })

    // Google にトークン更新リクエスト
    const tokenData = yield* refreshAccessToken(refreshToken)

    // セッションキャッシュ更新
    yield* session.update((prev) => ({
      ...prev,
      accessTokenCache: {
        ...prev.accessTokenCache,
        [accountId]: {
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        },
      },
    }))

    return makeGmailClient(tokenData.access_token)
  })
```

- [ ] **Step 2: OAuth コールバックを Effect.gen で書き換え**

490行のコールバックを Effect パイプラインに分解:
- `exchangeCode`: トークン交換
- `fetchUserInfo`: Google ユーザー情報取得
- `handleNewUser`: 新規ユーザー作成
- `handleReturningUser`: 既存ユーザーログイン
- `handleAddAccount`: アカウント追加

各関数が `Effect.Effect<A, AuthError, AppServices>` を返す。

- [ ] **Step 3: API ルートを Effect 化**

各ルートのハンドラを `handleEffect()` ヘルパーで wrap:

```typescript
// apps/web/src/routes/api/threads/index.ts
const handler = Effect.gen(function* () {
  const session = yield* SessionService
  const { userId } = yield* session.requireAuth()
  const accountId = yield* getQueryParam("accountId")
  const gmail = yield* getGmailClient(accountId)
  const threads = yield* gmail.request("/users/me/threads?maxResults=50", GmailThreadListResponseSchema)
  const adapted = yield* adaptThreads(threads, accountId)
  return Response.json({ threads: adapted })
})
```

- [ ] **Step 4: loader (routes/index.tsx) を Effect 化**

```typescript
const loader = createFileRoute("/")({
  loader: async ({ context }) => {
    const env = context.cloudflare.env
    return handleEffect(
      Effect.gen(function* () {
        const session = yield* SessionService
        const data = yield* session.get()
        if (!data.userId) return { accounts: [] }
        const accounts = yield* findLinkedAccountsByUserId(data.userId)
        return { accounts: accounts.map(toAccount) }
      }),
      env,
    )
  },
})
```

- [ ] **Step 5: typecheck + build**

```bash
pnpm run typecheck
pnpm run build
```

- [ ] **Step 6: コミット**

```bash
jj describe -m "feat: OAuth コールバック + 全 API ルートを Effect 化"
```

---

## Task 6: UI hooks の Effect 統合 (packages/ui)

**Files:**
- Create: `packages/ui/src/hooks/use-runtime.ts`
- Modify: `packages/ui/src/hooks/use-sync.ts` — Effect ベースに
- Modify: `packages/ui/src/hooks/use-thread-messages.ts` — Effect ベースに
- Modify: `packages/ui/src/hooks/use-oauth.ts` — Effect ベースに
- Modify: `packages/ui/src/hooks/use-store.ts` — Runtime コンテキスト追加
- Modify: `apps/web/src/components/app-shell.tsx` — Runtime Provider 追加
- Modify: `packages/ui/src/components/__tests__/sidebar.test.tsx` — 更新

- [ ] **Step 1: useRuntime hook を作成**

```typescript
// packages/ui/src/hooks/use-runtime.ts
import { createContext, useContext } from "react"
import { ManagedRuntime } from "effect"

/**
 * Effect の ManagedRuntime を React コンテキストで提供する。
 * フロントエンドの hooks から Effect を実行する際に使用。
 */
export const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<never, never> | null>(null)

export const useRuntime = () => {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error("RuntimeContext.Provider が見つかりません")
  return runtime
}
```

- [ ] **Step 2: use-sync.ts を Effect 化**

fetch を Effect パイプラインに変換。Schema decode でレスポンス型を保証。

- [ ] **Step 3: use-thread-messages.ts を Effect 化**

同様に Effect パイプライン + Schema decode に変換。

- [ ] **Step 4: use-oauth.ts を Effect 化**

`startAuth` を Effect で表現。エラーハンドリングを `Effect.catchTag` で型安全に。

- [ ] **Step 5: app-shell.tsx に Runtime Provider を追加**

```typescript
import { ManagedRuntime, Layer } from "effect"

const runtime = ManagedRuntime.make(Layer.empty)

function AppShell() {
  return (
    <RuntimeContext.Provider value={runtime}>
      {/* ... */}
    </RuntimeContext.Provider>
  )
}
```

- [ ] **Step 6: テスト更新**

既存の sidebar.test.tsx を更新して RuntimeContext の Provider を追加。

- [ ] **Step 7: typecheck + build + テスト**

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @vantagemail/ui run test
```

- [ ] **Step 8: コミット**

```bash
jj describe -m "feat: UI hooks を Effect 統合 (ManagedRuntime + Schema decode)"
```

---

## Task 7: Workers の Effect 化

**Files:**
- Modify: `workers/src/push.ts` — Effect 化
- Modify: `workers/src/scheduler.ts` — Effect 化
- Modify: `workers/src/oauth.ts` — Effect 化
- Modify: `workers/src/index.ts` — エントリポイント更新

- [ ] **Step 1: push.ts を Effect.gen で書き換え**

Pub/Sub 通知の受信 → KV 保存 → WebSocket ファンアウトを Effect パイプラインに。
エラー時も 200 を返す（Pub/Sub の ack 保証）ために `Effect.catchAll` を使用。

- [ ] **Step 2: scheduler.ts を Effect.gen で書き換え**

Cron ジョブ処理を Effect パイプラインに。KV 操作を `Effect.tryPromise` で型付け。

- [ ] **Step 3: oauth.ts を Effect 化**

Workers 用 OAuth ヘルパー関数を Effect 化。

- [ ] **Step 4: typecheck + build**

```bash
pnpm run typecheck
pnpm run build
```

- [ ] **Step 5: コミット**

```bash
jj describe -m "feat: Workers (push/scheduler) を Effect 化"
```

---

## Task 8: 最終統合 + クリーンアップ

**Files:**
- Modify: `packages/core/src/index.ts` — 不要な export 削除
- Modify: `packages/core/src/types/account.ts` — Schema 版に完全移行、旧型削除
- Modify: `packages/core/src/types/gmail.ts` — 同上
- Delete: 不要になった旧ファイル（あれば）
- Modify: `.oxlintrc.json` — 最終ルール調整

- [ ] **Step 1: 旧型定義を削除、Schema からの derive に完全移行**

`types/account.ts` と `types/gmail.ts` を Schema re-export のみに。

- [ ] **Step 2: 不要な import / export を削除**

全ファイルの unused import を除去。

- [ ] **Step 3: 全チェック**

```bash
pnpm run typecheck
pnpm run build
pnpm run test
oxlint .
```

- [ ] **Step 4: コミット**

```bash
jj describe -m "chore: Effect-TS 全面移行完了 — 旧コード削除 + クリーンアップ"
```

- [ ] **Step 5: PR 作成**

```bash
jj bookmark create feat/effect-ts -r @
jj git push --bookmark feat/effect-ts --allow-new
gh pr create --title "feat: Effect-TS 全面導入" --body "..."
```
