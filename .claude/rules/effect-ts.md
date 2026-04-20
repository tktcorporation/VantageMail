# EffectTS コーディング規約

## 原則: Effect でエラーを扱う

try/catch/throw の禁止は ast-grep ルール (`no-try-catch`) で強制される。
このファイルでは lint で扱えない設計ガイダンスを定める。

参照: `.ast-grep/rules/no-try-catch.yml`, `.ast-grep/rules/no-meaningless-fallback.yml`

## エラー型

`Data.TaggedError` を使う。`throw new Error(...)` は新規コードでは使わない。

```typescript
import { Data, Effect } from "effect";

class LockNotFoundError extends Data.TaggedError("LockNotFoundError")<{
  readonly path: string;
}> {}

class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
}> {}

const loadConfig = (dir: string) =>
  Effect.tryPromise({
    try: () => loadLock(dir),
    catch: (e) =>
      e instanceof Error && e.message.includes("ENOENT")
        ? new LockNotFoundError({ path: dir })
        : new ParseError({ message: String(e) }),
  });
```

## コーディングスタイル

- `Effect.gen` を標準スタイルとする（pipe チェーンより可読性が高い）
- `Effect.runPromise` は命令層（ルートハンドラ・コマンドのエントリポイント）でのみ呼ぶ
- ユーティリティ関数は `Effect<A, E, R>` を返す（内部で runPromise しない）
- エラーは Effect のエラーチャネルに残し、呼び出し側で `catchTag` / `catchAll` / `match` で処理する

## リソースクリーンアップ

`try/finally` の代わりに `Effect.acquireRelease` または `Effect.ensuring` を使う。

```typescript
const program = Effect.gen(function* () {
  yield* doWork();
}).pipe(Effect.ensuring(Effect.sync(() => cleanup())));
```

## 禁止パターン

### `Effect.orElseSucceed(() => null)` / `undefined` / `void`

エラーを握りつぶし、呼び出し側が型レベルでエラーの存在を認識できなくなる。
`Effect.option` で `Option<A>` に変換するか、`catchTag` で明示的に処理する。
ast-grep ルール `no-meaningless-fallback` で検出される。

### `throw new Error(\`Failed: ${error.message}\`)`

スタックトレースが消失する。`Data.TaggedError` を定義して Effect のエラーチャネルに流す。

### `Effect.Effect<T, Error | any | unknown>`

具体的な `TaggedError` の union を定義してパターンマッチ可能にする。

## 関連

- `.claude/rules/error-handling.md` — エラー分類と レイヤー別責務
- `.claude/rules/robustness.md` — ts-pattern / Schema / 不正状態排除
