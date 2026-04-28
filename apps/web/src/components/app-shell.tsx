/**
 * Web 版のアプリシェル。
 *
 * 背景: packages/ui の App コンポーネントに Web 固有の認証フローを注入する。
 * OAuth の開始はサーバーサイドの API_AUTH_START を呼び出し、PKCE code_verifier
 * のサーバー側保管と認可URL生成を委譲する。アカウント削除もサーバーサイドの
 * API_ACCOUNTS で処理する。クライアントには秘密情報を一切保持しない。
 *
 * API パスは `~/lib/api-paths.ts` の SSOT 定数を使用する。
 *
 * fetch のエラーは TaggedError + Effect.runPromise でハンドリングし、
 * try/catch を使わずに型レベルで失敗パスを明示する（.claude/rules/effect-ts.md）。
 *
 * エラーは「Network (fetch reject)」「Http (4xx/5xx 応答)」「Parse (JSON 不正)」
 * の 3 種類に discriminated union として分割する。これは AccountRemove* と
 * AuthStart* で同じ設計言語を採り、UI 側の ts-pattern dispatch を統一可能にする。
 *
 * defect 漏れ防止のため、`Effect.catchAllCause` で型付きエラー以外の Cause も
 * バックストップする。defect は `*Defect` タグに正規化して上流に伝え、UI 側で
 * 「予期しないエラー」を明示できるようにする。
 */
import { App, RuntimeContext } from "@vantagemail/ui";
import type { Account } from "@vantagemail/core";
import { useCallback } from "react";
import { Cause, Data, Effect, Either, ManagedRuntime, Layer } from "effect";
import { API_ACCOUNTS, API_AUTH_START } from "~/lib/api-paths.ts";

/**
 * Effect ManagedRuntime のシングルトンインスタンス。
 *
 * 背景: 現時点では Layer.empty で十分だが、将来的に HttpClient 等を追加する際に
 * ここで Layer を構成できる。コンポーネントの外で生成し、再レンダリングで
 * インスタンスが変わらないようにする。
 *
 * 削除条件: 全エフェクトが Layer 経由のサービスに置き換わり Layer.empty が
 * 不要になれば、useRuntime() の Provider ごと削除可能。
 *
 * 注意: モジュールスコープ初期化のため HMR/テストで再初期化されない。
 * Layer に副作用 (HttpClient プール等) が入る前に useState 化する。
 */
const runtime = ManagedRuntime.make(Layer.empty);

interface AppShellProps {
  initialAccounts?: Account[];
}

// ─── AuthStart 系エラー (3 タグの discriminated union) ───

/**
 * OAuth 開始 API の fetch reject (オフライン / DNS / CORS preflight 失敗)。
 * Response が手に入らなかった事実を専用タグで表現し、cause を必須化して
 * デバッグ情報を型レベルで保証する。
 */
class AuthStartNetworkError extends Data.TaggedError("AuthStartNetworkError")<{
  readonly cause: unknown;
}> {}

/**
 * OAuth 開始 API のサーバー応答エラー (HTTP 100-599)。
 * status はサーバーが返した HTTP ステータス、reason はサーバーが返した
 * `{ error }` フィールドまたは status ベースの fallback 文字列。
 */
class AuthStartHttpError extends Data.TaggedError("AuthStartHttpError")<{
  readonly status: number;
  readonly reason: string;
}> {}

/**
 * OAuth 開始 API のレスポンス JSON パース失敗。
 * 成功応答 (200) の body が JSON として読めなかったケース。
 * 4xx/5xx 応答 body のパース失敗は `AuthStartHttpError.reason` に丸めるため
 * ここでは扱わない。
 */
class AuthStartParseError extends Data.TaggedError("AuthStartParseError")<{
  readonly cause: unknown;
}> {}

// ─── AccountRemove 系エラー (3 タグの discriminated union) ───

/**
 * アカウント削除のネットワーク失敗（fetch 自体が reject されたケース）。
 *
 * 背景: ブラウザが Response を返さなかった場合 (オフライン、CORS preflight 失敗、
 * DNS 解決失敗 等) を専用タグで表現する。`cause` を必須にすることで、
 * デバッグ情報の保持を型レベルで強制する。
 *
 * HTTP の `Response.status === 0` (CORS 不透明応答等) との混同を避けるため、
 * status フィールドは持たせない（Response 自体が手に入らなかった事実を
 * 「Network」という別タグで表現する）。
 */
class AccountRemoveNetworkError extends Data.TaggedError("AccountRemoveNetworkError")<{
  readonly cause: unknown;
}> {}

/**
 * アカウント削除のサーバー応答エラー（HTTP 4xx / 5xx）。
 *
 * status は 100-599 の HTTP ステータスコード。body はサーバー応答本文を
 * デバッグ用に保持（読み取り失敗時は空文字列、警告ログを必ず出す）。
 * 401/403 は認証期限切れの可能性が高いため、UI 側で再ログイン導線に分岐する。
 */
class AccountRemoveHttpError extends Data.TaggedError("AccountRemoveHttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

/**
 * アカウント削除中の defect (Effect.die / 同期 throw / 想定外失敗)。
 *
 * 背景: `Effect.runPromise` の reject に乗る FiberFailure は `_tag` を持たないため、
 * UI 側の ts-pattern dispatch から `.otherwise` に流れて「再試行可能」風の文言で
 * 表示される問題があった。defect を専用タグに正規化し、UI が「予期しない失敗」
 * として明確に扱えるようにする。
 */
class AccountRemoveDefect extends Data.TaggedError("AccountRemoveDefect")<{
  readonly cause: unknown;
}> {}

// ─── 共通ヘルパー ───

/**
 * Response.text() を読み取り、失敗時は空文字列にフォールバックする。
 * 失敗を silent に潰さないよう、Either の Left 経路で警告ログを出す。
 *
 * 戻り値の型 `string` は「成功 = サーバー応答本文」「失敗 = "" の sentinel」を
 * 区別しない。意図的な単純化（body は cause としての参考情報であり、エラー
 * 判定には影響しないため）。区別が必要になったら戻り値を Option<string> 化する。
 */
const readBodyOrLog = (res: Response, context: string): Effect.Effect<string, never> =>
  Effect.tryPromise({
    try: () => res.text(),
    catch: (e) => e,
  }).pipe(
    Effect.catchAll((e) =>
      Effect.sync(() => {
        console.warn(`[${context}] response.text() failed (status=${res.status}):`, e);
        return "";
      }),
    ),
  );

export function AppShell({ initialAccounts }: AppShellProps) {
  /**
   * OAuth 認証フローをサーバー経由で開始する。
   * サーバーが PKCE 生成 → 暗号化セッションに保存 → 認可URLを返す。
   */
  const handleStartAuth = useCallback(() => {
    const program = Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(API_AUTH_START, { method: "POST" }),
        catch: (e) => new AuthStartNetworkError({ cause: e }),
      });

      if (!response.ok) {
        // 失敗応答の body を JSON としてパースし、サーバー提供の error 文字列を優先表示する。
        // パース失敗 / error フィールド欠落の双方でステータスコードベースの fallback に
        // フォールスルーする。Either で Right/Left を明示的に扱い、Effect 抽象境界
        // (Either.match) を尊重する。
        const fallbackReason = `認証開始に失敗: ${response.status}`;
        const parsed = yield* Effect.either(
          Effect.tryPromise({
            try: () => response.json() as Promise<{ error?: string }>,
            catch: (e) => e,
          }),
        );
        const reason = Either.match(parsed, {
          onLeft: () => fallbackReason,
          onRight: (data) => data.error ?? fallbackReason,
        });
        return yield* new AuthStartHttpError({ status: response.status, reason });
      }

      const { url } = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ url: string }>,
        catch: (e) => new AuthStartParseError({ cause: e }),
      });
      window.location.href = url;
    });

    // onStartAuth prop は () => void 契約のため Promise を返さず fire-and-forget。
    // 既知 TaggedError は catchTags でユーザー文言に変換し、defect (Effect.die や
    // 同期 throw 等の想定外) は catchAllCause でログだけ残す（UI 通知不要、
    // OAuth 開始は再試行ボタン経由で復帰可能なため）。
    void Effect.runPromise(
      program.pipe(
        Effect.catchTags({
          AuthStartNetworkError: (err) =>
            Effect.sync(() => {
              console.error("OAuth 開始 (network):", err);
              alert("ネットワークエラー: 接続を確認して再試行してください。");
            }),
          AuthStartHttpError: (err) =>
            Effect.sync(() => {
              console.error("OAuth 開始 (http):", err);
              alert(err.reason);
            }),
          AuthStartParseError: (err) =>
            Effect.sync(() => {
              console.error("OAuth 開始 (parse):", err);
              alert("認証応答が不正です。サーバー設定を確認してください。");
            }),
        }),
        Effect.catchAllCause((cause) =>
          Effect.sync(() => {
            console.error("OAuth 開始 (defect):", Cause.pretty(cause));
          }),
        ),
      ),
    );
  }, []);

  /**
   * アカウント連携を解除する。
   * サーバーの暗号化セッションからアカウント＋トークンを削除する。
   *
   * 呼び出し元（packages/ui/app.tsx の handleRemoveAccount）は Promise の
   * resolve/reject でストア更新の可否を判定する。ts-pattern dispatch で UX 文言を
   * 出し分けるため、Effect.runPromise の reject 値が必ず `_tag` 付き TaggedError
   * になるよう catchAllCause で defect を AccountRemoveDefect に正規化する。
   */
  const handleRemoveAccount = useCallback(async (accountId: string) => {
    const program = Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: () =>
          fetch(API_ACCOUNTS, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId }),
          }),
        catch: (e) => new AccountRemoveNetworkError({ cause: e }),
      });
      if (!res.ok) {
        // 4xx/5xx の body をデバッグ用に取得（読み取り失敗時は warning ログ + 空文字列）。
        const body = yield* readBodyOrLog(res, "AccountRemove");
        return yield* new AccountRemoveHttpError({ status: res.status, body });
      }
    });

    // catchAllCause で defect (Effect.die や同期 throw) を AccountRemoveDefect に
    // 正規化し、UI 側 ts-pattern が `.otherwise` に流す前に `_tag` 経由で識別できる
    // ようにする。これがないと FiberFailure として reject され、UX 文言が
    // 「再試行可能」風に丸められる潜在バグが残る (handleStartAuth との対称性)。
    //
    // 戻り値型を明示しないと、TS は条件分岐の片側 (Effect<never, A|B>) と
    // もう片側 (Effect<never, Defect>) の union を `Effect<never, A|B|Defect>` に
    // widening できない。注釈で union を明示することで catchAllCause の型整合を保つ。
    type RemoveErr = AccountRemoveNetworkError | AccountRemoveHttpError | AccountRemoveDefect;
    await Effect.runPromise(
      program.pipe(
        Effect.catchAllCause((cause): Effect.Effect<never, RemoveErr> => {
          const failure = Cause.failureOption(cause);
          if (failure._tag === "Some") {
            // 既知 TaggedError (Network / Http) はそのまま reject に流す
            return Effect.fail(failure.value);
          }
          // defect / interrupt は専用タグに包んでログ
          console.error("Account removal (defect):", Cause.pretty(cause));
          return Effect.fail(new AccountRemoveDefect({ cause }));
        }),
      ),
    );
  }, []);

  return (
    <RuntimeContext.Provider value={runtime}>
      <App
        onStartAuth={handleStartAuth}
        onRemoveAccount={handleRemoveAccount}
        initialAccounts={initialAccounts}
      />
    </RuntimeContext.Provider>
  );
}
