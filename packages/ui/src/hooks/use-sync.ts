/**
 * Gmail sync hook.
 *
 * 背景: マウント時に接続済みアカウント全ての初回スレッド取得をトリガーし、
 * サーバ側 /api/threads 経由で結果をストアに反映する。
 *
 * Effect TS を使ったエラーハンドリング:
 *   - fetch / decode は `Data.TaggedError` でタグ付けし、catchTags で種別ごとに処理
 *   - ローディング解除は `Effect.acquireRelease` で中断時も保証
 *   - console.error は `Effect.logError` に置換（将来的に監視基盤へ送れる）
 *
 * Schema.decodeUnknownSync で API レスポンスの ISO 日時文字列を Date へデコード。
 */
import { useCallback, useEffect, useRef } from "react";
import { Data, Effect } from "effect";
import { Schema } from "@effect/schema";
import { match } from "ts-pattern";
import type { StoreApi } from "zustand";
import type { AccountsStore, ThreadsStore } from "@vantagemail/core";

/**
 * /api/threads レスポンス用のスキーマ。
 *
 * 背景: API レスポンスでは lastMessageAt / snoozedUntil が ISO 文字列で返るため、
 * DateFromString で自動的に Date へデコードする。
 * ThreadSchema (DateFromSelf) とは異なり、JSON シリアライズ境界のデコードに使う。
 */
const ApiThreadSchema = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  lastMessageAt: Schema.DateFromString,
  participants: Schema.Array(Schema.String),
  messageCount: Schema.Number,
  labelIds: Schema.Array(Schema.String),
  isUnread: Schema.Boolean,
  isStarred: Schema.Boolean,
  snoozedUntil: Schema.optional(Schema.DateFromString),
  isPinned: Schema.Boolean,
});

/** /api/threads のレスポンス全体（nextPageToken を含む） */
const ApiThreadsResponseSchema = Schema.Struct({
  threads: Schema.optional(Schema.Array(ApiThreadSchema)),
  nextPageToken: Schema.optional(Schema.String),
});

// --- エラー型 ---
// 背景: fetch 系の失敗を種別ごとに分類することで、呼び出し側 (UI) が
// ts-pattern + catchTags でユーザー向けメッセージを厳密に出し分けできる。

class FetchNetworkError extends Data.TaggedError("FetchNetworkError")<{
  readonly cause: unknown;
  readonly accountEmail: string;
}> {}

class FetchStatusError extends Data.TaggedError("FetchStatusError")<{
  readonly status: number;
  readonly accountEmail: string;
}> {}

/**
 * 連携アカウントの認証が期限切れ / 取り消された。
 *
 * 背景: サーバー /api/threads は 401 + { error: "AuthExpiredError", accountId } を返す
 * （apps/web/src/lib/runtime.ts:84-90）。これを専用タグにすることで、
 * ts-pattern + catchTags で UI が再ログイン導線を出し分けできる。
 * 以前は FetchStatusError に吸収され、UI には「スレッド 0 件」としか見えなかった。
 */
class AccountAuthExpiredError extends Data.TaggedError("AccountAuthExpiredError")<{
  readonly accountId: string;
  readonly accountEmail: string;
}> {}

class ResponseDecodeError extends Data.TaggedError("ResponseDecodeError")<{
  readonly cause: unknown;
  readonly accountEmail: string;
}> {}

type SyncError =
  | FetchNetworkError
  | FetchStatusError
  | AccountAuthExpiredError
  | ResponseDecodeError;

/**
 * /api/threads が 401 で返す認証期限切れエラーのレスポンス形状。
 * runtime.ts の handleEffect が投入する JSON と一致させる。
 */
const AuthExpiredResponseSchema = Schema.Struct({
  error: Schema.Literal("AuthExpiredError"),
  accountId: Schema.String,
});

/**
 * 1 アカウント分のスレッドを取得して Effect で返す。
 *
 * fetch → status チェック → JSON decode → Schema decode を
 * 型付きエラーチャネルで連鎖させる。呼び出し側は catchTags で処理する。
 */
function fetchAccountThreads(params: {
  apiBase: string;
  accountId: string;
  accountEmail: string;
  pageToken?: string;
}): Effect.Effect<Schema.Schema.Type<typeof ApiThreadsResponseSchema>, SyncError> {
  const { apiBase, accountId, accountEmail, pageToken } = params;
  const qs = new URLSearchParams({ accountId });
  if (pageToken) qs.set("pageToken", pageToken);
  const url = `${apiBase}/api/threads?${qs.toString()}`;

  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (e) => new FetchNetworkError({ cause: e, accountEmail }),
    });

    if (!res.ok) {
      // 401 はアカウント認証期限切れの可能性があるため、body を覗いて判別する。
      // AuthExpiredError なら再ログイン用の専用タグに昇格させ、それ以外は汎用 FetchStatusError。
      if (res.status === 401) {
        const body = yield* Effect.tryPromise({
          try: () => res.json() as Promise<unknown>,
          catch: () => new FetchStatusError({ status: res.status, accountEmail }),
        });
        const parsed = yield* Schema.decodeUnknown(AuthExpiredResponseSchema)(body).pipe(
          Effect.option,
        );
        if (parsed._tag === "Some") {
          return yield* new AccountAuthExpiredError({
            accountId: parsed.value.accountId,
            accountEmail,
          });
        }
      }
      return yield* new FetchStatusError({ status: res.status, accountEmail });
    }

    const json = yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (e) => new ResponseDecodeError({ cause: e, accountEmail }),
    });

    return yield* Schema.decodeUnknown(ApiThreadsResponseSchema)(json).pipe(
      Effect.mapError((e) => new ResponseDecodeError({ cause: e, accountEmail })),
    );
  });
}

/**
 * SyncError をストア状態 + ログに落とす。ts-pattern で網羅性保証。
 *
 * 背景: アカウント認証が切れた場合、UI 側は「スレッド 0 件」としか見えないという
 * 不具合があった。ここで accountsStore の connectionStatus を更新することで、
 * 再ログインバナー (AuthExpiredBanner) が表示されるようになる。
 *
 * 将来的にここを Sentry / 監視基盤の send に置き換える際、
 * .exhaustive() により全ケース対応が型で強制される。
 */
const handleSyncError = (
  error: SyncError,
  accountsStore: StoreApi<AccountsStore>,
): Effect.Effect<void> =>
  match(error)
    .with({ _tag: "FetchNetworkError" }, (e) =>
      Effect.logError(`[sync] network failure for ${e.accountEmail}`, { cause: e.cause }),
    )
    .with({ _tag: "FetchStatusError" }, (e) =>
      Effect.logError(`[sync] HTTP ${e.status} for ${e.accountEmail}`),
    )
    .with({ _tag: "AccountAuthExpiredError" }, (e) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(
          `[sync] auth expired for ${e.accountEmail} (accountId=${e.accountId})`,
        );
        yield* Effect.sync(() =>
          accountsStore.getState().setConnectionStatus(e.accountId, "token_expired"),
        );
      }),
    )
    .with({ _tag: "ResponseDecodeError" }, (e) =>
      Effect.logError(`[sync] response decode failure for ${e.accountEmail}`, { cause: e.cause }),
    )
    .exhaustive();

interface UseSyncOptions {
  accountsStore: StoreApi<AccountsStore>;
  threadsStore: StoreApi<ThreadsStore>;
  /** Base URL for API calls. Defaults to "" (same origin). */
  apiBase?: string;
}

/**
 * マウント時に全アカウントのスレッドを取得し、無限スクロール用の fetchMore を返す。
 * ref ガードで二重取得を防止する。
 */
export function useSync({ accountsStore, threadsStore, apiBase = "" }: UseSyncOptions) {
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const accounts = accountsStore.getState().accounts;
    if (accounts.length === 0) return;

    // ローディング状態を acquireRelease で管理。
    // interrupt / 予期しない defect が起きても必ず setLoading(false) に戻る。
    const loadingGuard = Effect.acquireRelease(
      Effect.sync(() => threadsStore.getState().setLoading(true)),
      () => Effect.sync(() => threadsStore.getState().setLoading(false)),
    );

    const program = Effect.scoped(
      Effect.gen(function* () {
        yield* loadingGuard;

        yield* Effect.all(
          accounts.map((account) =>
            fetchAccountThreads({
              apiBase,
              accountId: account.id,
              accountEmail: account.email,
            }).pipe(
              Effect.tap(({ threads: rawThreads, nextPageToken }) =>
                Effect.sync(() => {
                  // Schema.decodeUnknown は readonly 配列を返すため、
                  // ストアの mutable Thread[] に合わせてスプレッドでコピーする。
                  const threads = [...(rawThreads ?? [])];
                  threadsStore.getState().setThreads(account.id, threads, nextPageToken);
                  // 成功したので connectionStatus を復帰させる（前回 token_expired になっていた場合）
                  accountsStore.getState().setConnectionStatus(account.id, "connected");
                }),
              ),
              // 1 アカウントの失敗が他に波及しないよう、ここで吸収する。
              // AccountAuthExpiredError の場合はストアを更新して UI 通知に繋げる。
              Effect.catchAll((e) => handleSyncError(e, accountsStore)),
            ),
          ),
          { concurrency: "unbounded" },
        );
      }),
    );

    // useEffect は Promise を返せないため、意図的に fire-and-forget する。
    // program 内部で全てのエラーは handleSyncError に吸収済み。
    void Effect.runPromise(program);
  }, [accountsStore, threadsStore, apiBase]);

  /**
   * 全アカウントの次ページを取得する（無限スクロール用）。
   *
   * pageToken が残っているアカウントのみ追加フェッチし、
   * 結果を appendThreads でマージする。
   */
  const fetchMore = useCallback(() => {
    const state = threadsStore.getState();
    if (state.isLoadingMore) return Promise.resolve();

    const accounts = accountsStore.getState().accounts;
    const accountsWithMore = accounts.filter((a) => state.pageTokenByAccount[a.id] != null);
    if (accountsWithMore.length === 0) return Promise.resolve();

    const loadingMoreGuard = Effect.acquireRelease(
      Effect.sync(() => threadsStore.getState().setLoadingMore(true)),
      () => Effect.sync(() => threadsStore.getState().setLoadingMore(false)),
    );

    const program = Effect.scoped(
      Effect.gen(function* () {
        yield* loadingMoreGuard;

        yield* Effect.all(
          accountsWithMore.map((account) => {
            const pageToken = threadsStore.getState().pageTokenByAccount[account.id];
            if (!pageToken) return Effect.void;

            return fetchAccountThreads({
              apiBase,
              accountId: account.id,
              accountEmail: account.email,
              pageToken,
            }).pipe(
              Effect.tap(({ threads: rawThreads, nextPageToken }) =>
                Effect.sync(() => {
                  const threads = [...(rawThreads ?? [])];
                  threadsStore.getState().appendThreads(account.id, threads, nextPageToken);
                  accountsStore.getState().setConnectionStatus(account.id, "connected");
                }),
              ),
              Effect.catchAll((e) => handleSyncError(e, accountsStore)),
            );
          }),
          { concurrency: "unbounded" },
        );
      }),
    );

    return Effect.runPromise(program);
  }, [accountsStore, threadsStore, apiBase]);

  return { fetchMore };
}
