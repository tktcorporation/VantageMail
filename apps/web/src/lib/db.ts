/**
 * D1 データベースヘルパー（Effect 版）。
 *
 * 背景: マルチアカウント認証のユーザー・アカウント情報を D1 に永続化する。
 * 各関数は Effect を返し、D1Service への依存を型レベルで表現する。
 * エラーは DbQueryError / DbNotFoundError として追跡される。
 *
 * D1Database 型は worker-configuration.d.ts（wrangler types で生成）で
 * グローバルに宣言されている。
 *
 * アクセスパターン:
 * - ユーザー検索: google_sub で（OAuthログイン時）
 * - アカウント一覧: user_id で（ページロード時）
 * - アカウント追加/削除: user_id + account_id で
 */
import { Effect } from "effect"
import { DbQueryError, DbNotFoundError } from "@vantagemail/core"
import { D1Service } from "./services/D1Service.ts"

/** D1 の users テーブル行 */
export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  encrypted_dek: string;
  dek_iv: string;
  created_at: number;
  updated_at: number;
}

/** D1 の linked_accounts テーブル行 */
export interface LinkedAccountRow {
  id: string;
  user_id: string;
  email: string;
  google_sub: string;
  display_name: string;
  avatar_url: string | null;
  color: string;
  encrypted_refresh_token: string;
  refresh_token_iv: string;
  token_scope: string;
  created_at: number;
  updated_at: number;
}

// --- User 操作 ---

/**
 * google_sub でユーザーを検索する。
 * 見つからない場合は null を返す（NotFound エラーにはしない）。
 *
 * 呼び出し元: OAuth コールバック（既存ユーザーの判定）
 */
export const findUserByGoogleSub = (googleSub: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    return yield* Effect.tryPromise({
      try: () =>
        db
          .prepare("SELECT * FROM users WHERE google_sub = ?")
          .bind(googleSub)
          .first<UserRow>(),
      catch: (e) =>
        new DbQueryError({ query: "findUserByGoogleSub", reason: String(e) }),
    })
  })

/**
 * 新規ユーザーを作成する。
 *
 * 呼び出し元: OAuth コールバック（初回ログイン時）
 */
export const createUser = (
  user: Omit<UserRow, "created_at" | "updated_at">,
) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const now = Date.now()
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO users (id, google_sub, email, display_name, avatar_url, encrypted_dek, dek_iv, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            user.id,
            user.google_sub,
            user.email,
            user.display_name,
            user.avatar_url,
            user.encrypted_dek,
            user.dek_iv,
            now,
            now,
          )
          .run(),
      catch: (e) =>
        new DbQueryError({ query: "createUser", reason: String(e) }),
    })
  })

/**
 * ユーザーのプロフィール情報を更新する（再ログイン時）。
 *
 * 呼び出し元: OAuth コールバック（既存ユーザーの情報更新）
 */
export const updateUserProfile = (
  googleSub: string,
  profile: { email: string; display_name: string; avatar_url: string | null },
) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE google_sub = ?`,
          )
          .bind(
            profile.email,
            profile.display_name,
            profile.avatar_url,
            Date.now(),
            googleSub,
          )
          .run(),
      catch: (e) =>
        new DbQueryError({ query: "updateUserProfile", reason: String(e) }),
    })
  })

// --- LinkedAccount 操作（Effect 版） ---

/**
 * ユーザーに紐づく全リンクアカウントを取得する。
 *
 * 呼び出し元: メール一覧ページ（ページロード時）
 */
export const findLinkedAccountsByUserId = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const result = yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            "SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY created_at ASC",
          )
          .bind(userId)
          .all<LinkedAccountRow>(),
      catch: (e) =>
        new DbQueryError({
          query: "findLinkedAccountsByUserId",
          reason: String(e),
        }),
    })
    return result.results
  })

/**
 * アカウント ID で単一のリンクアカウントを取得する。
 * 見つからない場合は DbNotFoundError を返す。
 *
 * 呼び出し元: アカウント個別操作（トークン更新、削除等）
 */
export const findLinkedAccountById = (accountId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const row = yield* Effect.tryPromise({
      try: () =>
        db
          .prepare("SELECT * FROM linked_accounts WHERE id = ?")
          .bind(accountId)
          .first<LinkedAccountRow>(),
      catch: (e) =>
        new DbQueryError({
          query: "findLinkedAccountById",
          reason: String(e),
        }),
    })
    if (!row) {
      return yield* Effect.fail(
        new DbNotFoundError({ table: "linked_accounts", key: accountId }),
      )
    }
    return row
  })

/**
 * ユーザー ID + メールアドレスでリンクアカウントを検索する。
 * 見つからない場合は null を返す。
 *
 * 呼び出し元: OAuth コールバック（既存アカウントの判定）
 */
export const findLinkedAccountByEmail = (userId: string, email: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    return yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            "SELECT * FROM linked_accounts WHERE user_id = ? AND email = ?",
          )
          .bind(userId, email)
          .first<LinkedAccountRow>(),
      catch: (e) =>
        new DbQueryError({
          query: "findLinkedAccountByEmail",
          reason: String(e),
        }),
    })
  })

/**
 * 新規リンクアカウントを作成する。
 *
 * 呼び出し元: OAuth コールバック（アカウント追加時）
 */
export const createLinkedAccount = (
  account: Omit<LinkedAccountRow, "created_at" | "updated_at">,
) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const now = Date.now()
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO linked_accounts
             (id, user_id, email, google_sub, display_name, avatar_url, color, encrypted_refresh_token, refresh_token_iv, token_scope, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            account.id,
            account.user_id,
            account.email,
            account.google_sub,
            account.display_name,
            account.avatar_url,
            account.color,
            account.encrypted_refresh_token,
            account.refresh_token_iv,
            account.token_scope,
            now,
            now,
          )
          .run(),
      catch: (e) =>
        new DbQueryError({ query: "createLinkedAccount", reason: String(e) }),
    })
  })

/**
 * refresh_token の更新（トークンローテーション時）。
 * userId チェック付きで、他ユーザーのアカウントを誤って更新するのを防ぐ。
 *
 * 呼び出し元: トークンリフレッシュ処理
 */
export const updateLinkedAccountToken = (
  accountId: string,
  encrypted: {
    encrypted_refresh_token: string;
    refresh_token_iv: string;
    token_scope: string;
  },
  userId?: string,
) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    if (userId) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `UPDATE linked_accounts
               SET encrypted_refresh_token = ?, refresh_token_iv = ?, token_scope = ?, updated_at = ?
               WHERE id = ? AND user_id = ?`,
            )
            .bind(
              encrypted.encrypted_refresh_token,
              encrypted.refresh_token_iv,
              encrypted.token_scope,
              Date.now(),
              accountId,
              userId,
            )
            .run(),
        catch: (e) =>
          new DbQueryError({
            query: "updateLinkedAccountToken",
            reason: String(e),
          }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `UPDATE linked_accounts
               SET encrypted_refresh_token = ?, refresh_token_iv = ?, token_scope = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(
              encrypted.encrypted_refresh_token,
              encrypted.refresh_token_iv,
              encrypted.token_scope,
              Date.now(),
              accountId,
            )
            .run(),
        catch: (e) =>
          new DbQueryError({
            query: "updateLinkedAccountToken",
            reason: String(e),
          }),
      })
    }
  })

/**
 * アカウントのプロフィール情報を更新する（再認証時）。
 * userId チェック付きで、他ユーザーのアカウントを誤って更新するのを防ぐ。
 *
 * 呼び出し元: OAuth コールバック（再認証フロー）
 */
export const updateLinkedAccountProfile = (
  accountId: string,
  profile: { display_name: string; avatar_url: string | null },
  userId?: string,
) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    if (userId) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `UPDATE linked_accounts SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
            )
            .bind(
              profile.display_name,
              profile.avatar_url,
              Date.now(),
              accountId,
              userId,
            )
            .run(),
        catch: (e) =>
          new DbQueryError({
            query: "updateLinkedAccountProfile",
            reason: String(e),
          }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare(
              `UPDATE linked_accounts SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?`,
            )
            .bind(
              profile.display_name,
              profile.avatar_url,
              Date.now(),
              accountId,
            )
            .run(),
        catch: (e) =>
          new DbQueryError({
            query: "updateLinkedAccountProfile",
            reason: String(e),
          }),
      })
    }
  })

/**
 * リンクアカウントを削除する。
 * userId でスコープを絞り、他ユーザーのアカウントを削除できないようにする。
 *
 * 呼び出し元: アカウント削除 API
 * @returns 削除された行があったかどうか
 */
export const deleteLinkedAccount = (userId: string, accountId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    const result = yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            "DELETE FROM linked_accounts WHERE id = ? AND user_id = ?",
          )
          .bind(accountId, userId)
          .run(),
      catch: (e) =>
        new DbQueryError({ query: "deleteLinkedAccount", reason: String(e) }),
    })
    return result.meta.changes > 0
  })

/**
 * ユーザーを削除する。
 * linked_accounts は ON DELETE CASCADE で自動削除される。
 *
 * 呼び出し元: アカウント完全削除 API
 */
export const deleteUser = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* D1Service
    yield* Effect.tryPromise({
      try: () =>
        db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run(),
      catch: (e) =>
        new DbQueryError({ query: "deleteUser", reason: String(e) }),
    })
  })

