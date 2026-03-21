# Effect-TS 全面導入 設計書

## 概要

VantageMail の全コードベースを Effect-TS で書き換える。
対象: `packages/core`, `packages/ui`, `apps/web`, `workers/`

## 背景

- 現状は try/catch + 文字列エラーコード + null チェックが散在
- エラーの型安全性がなく、リカバリパスが不明確
- D1/暗号化/OAuth の複雑なパイプラインが手続き的に書かれている
- プロジェクト初期段階のため、今が全面導入の最適なタイミング

## 導入パッケージ

```
effect          — コアランタイム (Effect, Layer, Schema, Config, etc.)
@effect/platform — HTTP クライアント、FileSystem 等
@effect/schema  — ランタイムバリデーション + 型生成
@effect/eslint-plugin — Effect 向け ESLint ルール
```

## アーキテクチャ

### Service 定義 (packages/core)

```
D1Database Service    — D1 バインディングのラッパー
CryptoService         — KEK/DEK 導出、暗号化/復号
SessionService        — セッション読み書き
GmailApiService       — Gmail API クライアント (リトライ/レート制限内蔵)
ConfigService         — 環境変数の型安全な取得
```

### エラー型 (Discriminated Unions)

```typescript
// packages/core/src/errors.ts
class TokenExchangeError extends Data.TaggedError("TokenExchangeError")<{
  status: number;
  details: string;
}> {}

class DecryptionError extends Data.TaggedError("DecryptionError")<{
  reason: string;
}> {}

class DbNotFoundError extends Data.TaggedError("DbNotFoundError")<{
  table: string;
  key: string;
}> {}

class GmailApiError extends Data.TaggedError("GmailApiError")<{
  status: number;
  path: string;
  body: string;
}> {}

class SessionError extends Data.TaggedError("SessionError")<{
  reason: string;
}> {}

class ConfigError extends Data.TaggedError("ConfigError")<{
  key: string;
}> {}
```

### Schema 定義 (packages/core)

現在の手書き型を `@effect/schema` に置換:

```typescript
const Account = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
  color: Schema.String,
});

const Thread = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  lastMessageAt: Schema.Date,
  // ...
});

// API レスポンスの decode
const GmailThreadListResponse = Schema.Struct({
  threads: Schema.optional(Schema.Array(GmailThreadSchema)),
  nextPageToken: Schema.optional(Schema.String),
});
```

### Cloudflare Workers 統合パターン

Cloudflare は env をリクエスト時に渡す。Effect の Layer はリクエストスコープで構築:

```typescript
// apps/web/src/lib/runtime.ts
const makeAppLayer = (env: CloudflareEnv) =>
  Layer.mergeAll(
    D1Service.layer(env.DB),
    CryptoService.layer(env),
    SessionService.layer,
    ConfigService.layer(env),
  );

// API ルートで使用
export const handleWithEffect = <A, E>(
  effect: Effect.Effect<Response, E, AppServices>,
  env: CloudflareEnv,
) => Effect.runPromise(effect.pipe(Effect.provide(makeAppLayer(env))));
```

### DB 層 (apps/web/src/lib/db.ts)

```typescript
// Before
export async function findUserByGoogleSub(
  db: D1Database,
  googleSub: string,
): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(googleSub).first<UserRow>();
}

// After
export const findUserByGoogleSub = (googleSub: string) =>
  D1Service.pipe(
    Effect.flatMap((db) =>
      Effect.tryPromise({
        try: () =>
          db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(googleSub).first<UserRow>(),
        catch: (e) => new DbQueryError({ query: "findUserByGoogleSub", reason: String(e) }),
      }),
    ),
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(row)
        : Effect.fail(new DbNotFoundError({ table: "users", key: googleSub })),
    ),
  );
```

### OAuth コールバック (apps/web/src/routes/oauth/callback.tsx)

```typescript
// 3つのフローを Effect.gen で表現
const handleOAuthCallback = (code: string, state: string) =>
  Effect.gen(function* () {
    const config = yield* ConfigService;
    const crypto = yield* CryptoService;
    const db = yield* D1Service;
    const session = yield* SessionService;

    // トークン交換
    const tokenData = yield* exchangeCode(config, code);

    // Google ユーザー情報取得
    const userInfo = yield* fetchUserInfo(tokenData.access_token);
    const googleSub = yield* extractGoogleSub(tokenData.id_token);

    // 既存ユーザー判定 → 分岐
    const existingUser = yield* findUserByGoogleSub(googleSub).pipe(
      Effect.catchTag("DbNotFoundError", () => Effect.succeed(null)),
    );

    if (existingUser) {
      yield* handleReturningUser(existingUser, tokenData, userInfo);
    } else {
      yield* handleNewUser(googleSub, tokenData, userInfo);
    }

    return redirectToHome();
  });
```

### Gmail API クライアント (packages/core)

```typescript
export class GmailClient extends Context.Tag("GmailClient")<
  GmailClient,
  {
    listThreads: (params: ListThreadsParams) => Effect.Effect<GmailThreadList, GmailApiError>
    getThread: (id: string) => Effect.Effect<GmailThread, GmailApiError>
    getMessage: (id: string) => Effect.Effect<GmailMessage, GmailApiError>
  }
>() {}

// リトライポリシー内蔵
const retryPolicy = Schedule.exponential("1 second").pipe(
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput((err: GmailApiError) => err.status === 429)
)

const request = <T>(path: string, options?: RequestInit) =>
  Effect.tryPromise({
    try: () => fetch(`https://gmail.googleapis.com/gmail/v1${path}`, options),
    catch: (e) => new GmailApiError({ status: 0, path, body: String(e) }),
  }).pipe(
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({ try: () => res.json() as Promise<T>, catch: (e) => new GmailApiError({ ... }) })
        : Effect.fail(new GmailApiError({ status: res.status, path, body: "" }))
    ),
    Effect.retry(retryPolicy),
  )
```

### Zustand Store → Effect 統合 (packages/ui)

Zustand store は維持しつつ、非同期アクションを Effect で表現:

```typescript
// ManagedRuntime をコンテキストで提供
const AppRuntimeContext = createContext<ManagedRuntime.ManagedRuntime<AppServices, never>>(null!)

// useEffect 内で Effect を実行
const useSync = () => {
  const runtime = useContext(AppRuntimeContext)
  const accountsStore = useAccountsStore()

  useEffect(() => {
    const fiber = runtime.runFork(
      syncAllAccounts.pipe(
        Effect.tap((threads) => Effect.sync(() => threadsStore.getState().setThreads(...)))
      )
    )
    return () => { runtime.runPromise(Fiber.interrupt(fiber)) }
  }, [])
}
```

### OxLint + Effect ESLint Plugin

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["@effect/eslint-plugin"],
  "rules": {
    "@effect/dprint": "off",
    "@effect/no-curry-arrow": "error",
  },
}
```

OxLint の JS Plugins Alpha (2026-03) が ESLint プラグイン互換 API を提供しているため、
`@effect/eslint-plugin` を OxLint 経由で実行可能。vite-plus の lint タスクに統合。

### ディレクトリ構成の変更

```
packages/core/src/
  errors.ts          — 全エラー型定義
  schemas/           — @effect/schema 定義
    account.ts
    thread.ts
    message.ts
    gmail-api.ts
  services/          — Effect Service 定義
    GmailClient.ts
    D1Service.ts     — (apps/web から移動の可能性)
  stores/            — Zustand stores (維持)

apps/web/src/
  lib/
    runtime.ts       — ManagedRuntime + Layer 構築
    services/        — Cloudflare 固有 Service 実装
      D1ServiceLive.ts
      CryptoServiceLive.ts
      SessionServiceLive.ts
      ConfigServiceLive.ts
  routes/
    oauth/callback.tsx — Effect.gen ベースに書き換え
    api/              — 全ルート Effect 化
```

## 対象外

- TanStack Router のルーティング構造自体は変更しない
- React コンポーネントの JSX 構造は変更しない（hooks 層のみ Effect 化）
- D1 マイグレーションファイルは変更しない
- vite-plus (vp) のビルド構成は維持

## 成功基準

- `pnpm run typecheck` がエラーなしで通る
- `pnpm run build` が成功する
- OAuth フロー（新規/再ログイン/アカウント追加）が動作する
- メール一覧/詳細の表示が動作する
- 全エラーが型レベルで追跡可能（`Effect<A, E, R>` の E に反映）
