/**
 * D1 データベースヘルパー。
 *
 * 背景: マルチアカウント認証のユーザー・アカウント情報を D1 に永続化する。
 * Cloudflare Workers の D1 バインディングを直接使用し、ORM は使わない。
 * 型安全性は TypeScript のインターフェースで担保する。
 *
 * アクセスパターン:
 * - ユーザー検索: google_sub で（OAuthログイン時）
 * - アカウント一覧: user_id で（ページロード時）
 * - アカウント追加/削除: user_id + account_id で
 */

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

/**
 * D1 バインディングを取得する。
 *
 * TanStack Start + Cloudflare Workers では `cloudflare:workers` モジュールから
 * env オブジェクトをインポートして D1 バインディングにアクセスする。
 */
export function getDB(): D1Database {
  // cloudflare:workers はビルド時に解決される Cloudflare 固有モジュール。
  // 動的 import にすると開発時のモジュール解決エラーを回避できるが、
  // TanStack Start の SSR ではサーバールートでのみ呼ばれるため問題ない。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { env } = require("cloudflare:workers") as {
    env: { DB: D1Database };
  };
  return env.DB;
}

// --- User 操作 ---

export async function findUserByGoogleSub(
  db: D1Database,
  googleSub: string,
): Promise<UserRow | null> {
  return db
    .prepare("SELECT * FROM users WHERE google_sub = ?")
    .bind(googleSub)
    .first<UserRow>();
}

export async function createUser(
  db: D1Database,
  user: Omit<UserRow, "created_at" | "updated_at">,
): Promise<void> {
  const now = Date.now();
  await db
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
    .run();
}

export async function updateUserProfile(
  db: D1Database,
  googleSub: string,
  profile: { email: string; display_name: string; avatar_url: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE google_sub = ?`,
    )
    .bind(profile.email, profile.display_name, profile.avatar_url, Date.now(), googleSub)
    .run();
}

// --- LinkedAccount 操作 ---

export async function findLinkedAccountsByUserId(
  db: D1Database,
  userId: string,
): Promise<LinkedAccountRow[]> {
  const result = await db
    .prepare("SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all<LinkedAccountRow>();
  return result.results;
}

export async function findLinkedAccountByEmail(
  db: D1Database,
  userId: string,
  email: string,
): Promise<LinkedAccountRow | null> {
  return db
    .prepare("SELECT * FROM linked_accounts WHERE user_id = ? AND email = ?")
    .bind(userId, email)
    .first<LinkedAccountRow>();
}

export async function createLinkedAccount(
  db: D1Database,
  account: Omit<LinkedAccountRow, "created_at" | "updated_at">,
): Promise<void> {
  const now = Date.now();
  await db
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
    .run();
}

/** refresh_token の更新（トークンローテーション時） */
export async function updateLinkedAccountToken(
  db: D1Database,
  accountId: string,
  encrypted: { encrypted_refresh_token: string; refresh_token_iv: string; token_scope: string },
): Promise<void> {
  await db
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
    .run();
}

/** アカウントのプロフィール情報を更新する（再認証時） */
export async function updateLinkedAccountProfile(
  db: D1Database,
  accountId: string,
  profile: { display_name: string; avatar_url: string | null },
): Promise<void> {
  await db
    .prepare(
      `UPDATE linked_accounts SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(profile.display_name, profile.avatar_url, Date.now(), accountId)
    .run();
}

export async function deleteLinkedAccount(
  db: D1Database,
  userId: string,
  accountId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM linked_accounts WHERE id = ? AND user_id = ?")
    .bind(accountId, userId)
    .run();
  return result.meta.changes > 0;
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  // linked_accounts は ON DELETE CASCADE で自動削除される
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
