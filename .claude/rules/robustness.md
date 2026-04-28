# 堅牢性設計ガイドライン

## 基本理念: Design for Correctness

**優先順位**: 型による保証 > 静的解析 (ast-grep / oxlint) > ランタイム検証 (Schema) > テスト

「動かないコードは書けない」設計 > 「動かないコードを見つける」テスト

---

## ts-pattern（パターンマッチング）

**Union 型の網羅チェックには `match()` + `.exhaustive()` を使う。** if/else の連結や switch-default は避ける。

```typescript
import { match, P } from "ts-pattern";

type Status = "pending" | "running" | "completed" | "failed";

const getMessage = (status: Status): string =>
  match(status)
    .with("pending", () => "待機中")
    .with("running", () => "実行中")
    .with("completed", () => "完了")
    .with("failed", () => "失敗")
    .exhaustive();
```

新しい `Status` 値を追加した瞬間にコンパイルエラーになる — これが網羅性保証。

**使用場面**: Union 型分岐、エラー種別分類、状態遷移、`_tag` つき TaggedError のハンドリング
**例外**: 単純な boolean 判定（`if (isLoading)`）は if で OK

### 便利パターン

- `P.union('a', 'b')` — 複数値マッチ
- `P.instanceOf(MyError)` — 型ガード
- `P.nonNullable` — null/undefined を除外
- `.otherwise(fn)` — 網羅性より柔軟性を優先する場合

---

## @effect/schema（外部境界バリデーション）

**使用場面**: API 境界（HTTP リクエスト/レスポンス）、D1 / KV の読み書き、環境変数、ユーザー入力、OAuth レスポンス

```typescript
import { Schema } from "@effect/schema";

const User = Schema.Struct({
  id: Schema.UUID,
  name: Schema.String.pipe(Schema.minLength(1)),
  role: Schema.Literal("admin", "user", "guest"),
});
type User = Schema.Schema.Type<typeof User>;

const parseUser = Schema.decodeUnknown(User); // Effect<User, ParseError>
```

### Branded Types（ID 混同防止）

```typescript
const UserId = Schema.UUID.pipe(Schema.brand("UserId"));
const ThreadId = Schema.String.pipe(Schema.brand("ThreadId"));
// getThread(userId) → コンパイルエラー
```

---

## 設計パターン

### 不正な状態を表現不可能にする

```typescript
// NG: isLoading=true かつ data != null が可能
interface State {
  isLoading: boolean;
  data: Data | null;
  error: Error | null;
}

// OK: 不正な状態が型レベルで排除
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Data }
  | { status: "error"; error: AppError };
```

### Parse, Don't Validate

検証と型変換を同時に行う。検証後も `string` のままにしない — Schema / branded type に変換する。

### 早期リターンと型の絞り込み

```typescript
if (!user) return yield * new NotFoundError({ id });
// 以降 user は User 型（non-null 保証）
```

---

## アンチパターン

- `any` / `unknown` の安易な使用 → Schema 経由で型を導出する（`oxlint` で `typescript/no-explicit-any: error`）
- 型アサーション `as` の濫用 → Schema の `decodeUnknown` を使う
- `if/else` で Union 型を分岐 → ts-pattern + `.exhaustive()` を使う
- `switch` の default 省略 → ts-pattern に置き換える
- オプショナルチェーンの過剰使用 (`a?.b?.c?.d`) → 明示的な null チェック + 早期リターン

## 関連

- `.claude/rules/effect-ts.md` — Effect のエラーチャネルと runPromise 境界
- `.claude/rules/error-handling.md` — レイヤー別エラー責務
- `.ast-grep/rules/` — lint で強制されるパターン
