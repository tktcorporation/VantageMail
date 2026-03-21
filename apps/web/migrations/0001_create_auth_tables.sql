-- マルチアカウント認証のためのテーブル定義。
-- users: メインアカウント（最初にOAuth連携したGmail）。google_sub で一意に識別。
-- linked_accounts: メインアカウントに紐付く各Gmailアカウント。メイン自身も含む。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  -- DEK（データ暗号化キー）を KEK で AES-GCM 暗号化した値。
  -- KEK = HKDF(SERVER_SECRET, google_sub) から導出。
  -- DB漏洩だけでは復号不可（SERVER_SECRET が必要）。
  encrypted_dek TEXT NOT NULL,
  dek_iv TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  color TEXT NOT NULL,
  -- refresh_token を DEK で AES-GCM 暗号化した値。
  -- 二重暗号化構造: DB漏洩 + SERVER_SECRET 漏洩の両方がないと復号不可。
  encrypted_refresh_token TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  token_scope TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- ユーザーの全アカウント一覧取得を高速化
CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_id ON linked_accounts(user_id);
-- メールアドレスでの重複チェック（同一ユーザー内で同じGmailを二重登録しない）
CREATE UNIQUE INDEX IF NOT EXISTS idx_linked_accounts_user_email ON linked_accounts(user_id, email);
