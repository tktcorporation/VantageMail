# エラーハンドリングルール

## 基本: try-catch を避け、Effect TS を使用

try/catch は ast-grep ルール `no-try-catch` で禁止される。

| 状況          | パターン                                                             |
| ------------- | -------------------------------------------------------------------- |
| 同期処理      | `Effect.try({ try: () => ..., catch: (e): MyError => ... })`         |
| 非同期処理    | `Effect.tryPromise({ try: () => ..., catch: (e): MyError => ... })`  |
| Effect の連結 | `.pipe(Effect.flatMap())`, `.pipe(Effect.map())`, `Effect.gen`       |
| エラー分岐    | `Effect.catchTag` / `Effect.catchTags` / `Effect.match` / ts-pattern |

### try-catch が許容されるケース（ast-grep ignore 対象のみ）

1. テストコード（`**/__tests__/**`, `*.test.ts`, `*.spec.ts`）
2. E2E テスト

それ以外のファイルで try/catch が必要になったら、設計を見直す。

---

## エラーの分類

| 種別             | 処理                                  | 例                                            |
| ---------------- | ------------------------------------- | --------------------------------------------- |
| 予期されたエラー | `Effect<T, E>` のエラーチャネル       | ファイル未検出、バリデーション、タイムアウト  |
| 予期しないエラー | `Effect.die` または defect として伝搬 | DB 接続エラー、メモリ不足、プログラミングミス |

予期しないエラーは `runPromise` のトップレベルで一括ログし、監視基盤へ送る。

---

## エラー型は具体的に定義

```typescript
// NG: パターンマッチ不可
function getData(): Effect.Effect<Data, Error> { ... }

// OK: 呼び出し側で exhaustive にハンドリング可能
class NotFoundError extends Data.TaggedError("NotFoundError")<{ id: string }> {}
class ValidationError extends Data.TaggedError("ValidationError")<{ message: string }> {}

function getData(id: string): Effect.Effect<Data, NotFoundError | ValidationError> { ... }
```

---

## エラー分類には ts-pattern / catchTags を使う

```typescript
import { Effect } from "effect";
import { match } from "ts-pattern";

const handled = program.pipe(
  Effect.catchTags({
    NotFoundError: (e) => Effect.succeed(defaultFor(e.id)),
    ValidationError: (e) => Effect.logError(e.message).pipe(Effect.andThen(Effect.fail(e))),
  }),
);

const toHttp = (error: AppError) =>
  match(error)
    .with({ _tag: "NotFoundError" }, (e) => ({ status: 404, body: e.id }))
    .with({ _tag: "ValidationError" }, (e) => ({ status: 400, body: e.message }))
    .exhaustive();
```

---

## 禁止パターン

| パターン                                        | 問題                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| `throw new Error(\`Failed: ${error.message}\`)` | スタックトレース消失。`Data.TaggedError` を使う |
| `catch (e) { console.log(...) }`                | エラー握りつぶし。監視基盤に送信されない        |
| `Effect.Effect<T, Error \| any \| unknown>`     | パターンマッチ不可。具体型 (TaggedError) を定義 |
| `Effect.orElseSucceed(() => null)`              | エラーが型から消える。`Effect.option` を使う    |

---

## レイヤー別の責務

| レイヤー     | 責務                                     | パターン                            |
| ------------ | ---------------------------------------- | ----------------------------------- |
| Service      | エラー分類、予期されたエラーの返却       | `Effect.Effect<T, E>`               |
| Route/Worker | Effect→HTTP Response 変換 / `runPromise` | `Effect.catchTags` → status + body  |
| Frontend     | ユーザー向けメッセージ表示               | Toast + ts-pattern でエラー種別ごと |

## 関連リンター

- `pnpm lint` → `oxlint` + `ast-grep scan`
- `ast-grep` のルール: `.ast-grep/rules/`
