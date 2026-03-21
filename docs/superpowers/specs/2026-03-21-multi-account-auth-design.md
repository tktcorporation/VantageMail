# マルチアカウント認証設計

## 概要

現在のセッションCookieベースの認証を、D1データベースによる永続化＋暗号化トークン管理に移行する。
メインアカウント（最初にOAuth連携したGmail）にログインするだけで、紐付け済みの全アカウントが即座に利用可能になる。

## 動機

現状の問題:

- セッションCookieにアカウント情報とOAuthトークンを直接格納している
- セッション切れ（30日）で全アカウントの再認証が必要
- 新デバイスでは全アカウントを一つずつ手動で追加し直す必要がある

目標:

- Spark Mail のように、メインアカウントでログインすれば全アカウントが復元される体験
- OAuthトークンのサーバーサイド暗号化によるセキュリティ確保

## セキュリティモデル

### 暗号化アーキテクチャ（二重暗号化）

```
SERVER_SECRET (env var) + google_sub (OAuth ID token)
    ↓ HKDF
KEK (Key Encryption Key)
    ↓ AES-GCM encrypt
DEK (Data Encryption Key, ランダム生成)
    ↓ AES-GCM encrypt
各アカウントの refresh_token
```

- **KEK**: `HKDF(SERVER_SECRET, google_sub)` から導出。サーバーシークレットとユーザー固有IDの両方が必要
- **DEK**: ユーザーごとにランダム生成。KEKで暗号化してD1に保存
- **refresh_token**: DEKで暗号化してD1に保存
- **access_token**: DBに保存しない（短命、セッションにキャッシュ）

### セキュリティ特性

| 攻撃シナリオ            | 復号可能？ | 理由                                       |
| ----------------------- | ---------- | ------------------------------------------ |
| DB漏洩のみ              | 不可       | SERVER_SECRET がない                       |
| 環境変数漏洩のみ        | 不可       | google_sub がない                          |
| DB + 環境変数の両方     | 可能       | だがこの時点でサーバー全体が侵害されている |
| 正規ユーザーのOAuth認証 | 可能       | 正常動作                                   |

## データモデル（D1スキーマ）

### users テーブル

| カラム        | 型          | 説明                             |
| ------------- | ----------- | -------------------------------- |
| id            | TEXT PK     | UUID v4                          |
| google_sub    | TEXT UNIQUE | Google の不変ユーザーID          |
| email         | TEXT        | メインアカウントのメールアドレス |
| display_name  | TEXT        | 表示名                           |
| avatar_url    | TEXT        | プロフィール画像URL              |
| encrypted_dek | TEXT        | KEKで暗号化されたDEK（base64）   |
| dek_iv        | TEXT        | DEK暗号化時のIV（base64）        |
| created_at    | INTEGER     | 作成日時（Unix ms）              |
| updated_at    | INTEGER     | 更新日時（Unix ms）              |

### linked_accounts テーブル

| カラム                  | 型      | 説明                        |
| ----------------------- | ------- | --------------------------- |
| id                      | TEXT PK | UUID v4                     |
| user_id                 | TEXT FK | users.id への外部キー       |
| email                   | TEXT    | Gmailアドレス               |
| google_sub              | TEXT    | このアカウントの Google sub |
| display_name            | TEXT    | 表示名                      |
| avatar_url              | TEXT    | プロフィール画像URL         |
| color                   | TEXT    | UI表示用カラー              |
| encrypted_refresh_token | TEXT    | DEKで暗号化（base64）       |
| refresh_token_iv        | TEXT    | 暗号化時のIV（base64）      |
| token_scope             | TEXT    | OAuthスコープ               |
| created_at              | INTEGER | 作成日時                    |
| updated_at              | INTEGER | 更新日時                    |

## 認証フロー

### 1. 初回登録（新規ユーザー）

```
POST /api/auth/start → PKCE生成、セッション保存
↓ Google OAuth
GET /oauth/callback
  1. code → access_token + refresh_token + id_token 取得
  2. id_token から google_sub 抽出
  3. D1 で users を検索 → 見つからない → 新規ユーザー
  4. DEK をランダム生成
  5. KEK = HKDF(SERVER_SECRET, google_sub)
  6. DEK を KEK で暗号化 → users に保存
  7. refresh_token を DEK で暗号化 → linked_accounts に保存
  8. セッションに { userId, dek } を保存
→ / にリダイレクト
```

### 2. ログイン（既存ユーザー・新デバイス）

```
GET /oauth/callback
  1. id_token から google_sub 抽出
  2. D1 で users 検索 → 見つかる
  3. KEK = HKDF(SERVER_SECRET, google_sub)
  4. encrypted_dek を復号 → DEK 取得
  5. セッションに { userId, dek } を保存
  6. メインアカウントの refresh_token を更新（新しいものが返った場合）
→ 全 linked_accounts が即座に利用可能
```

### 3. アカウント追加（ログイン済み）

```
POST /api/auth/start (セッションに userId があるので追加モード)
↓ Google OAuth（別の Gmail を選択）
GET /oauth/callback
  1. セッションから { userId, dek } を取得
  2. 新アカウントの refresh_token を DEK で暗号化
  3. linked_accounts に追加
→ サイドバーに新アカウント出現
```

## セッション構造（変更後）

```typescript
interface AppSessionData {
  userId?: string; // users.id（ログイン済み）
  dek?: string; // 平文 DEK（base64、ログイン済み）
  codeVerifier?: string; // PKCE（認証フロー中のみ）
  accessTokenCache?: Record<
    string,
    {
      accessToken: string;
      expiresAt: number;
    }
  >;
}
```

## トークンライフサイクル

- **access_token**: セッションにキャッシュ。有効期限5分前にrefreshする
- **refresh_token**: D1にDEK暗号化して保存。Googleがローテーションした場合は再暗号化してUPDATE
- **セッション切れ時**: 再OAuth → KEK再導出 → DEK復号 → 全アカウント復帰

## 移行

破壊的移行。既存セッションをリセットし、次回アクセス時に再認証を促す。

## 影響範囲

### 新規作成

- `apps/web/src/lib/crypto.ts` — HKDF, AES-GCM 暗号化ユーティリティ
- `apps/web/src/lib/db.ts` — D1 スキーマ定義（Drizzle）と接続
- `apps/web/src/lib/auth.ts` — 認証ヘルパー（ユーザー検索、作成、トークン管理）

### 変更

- `apps/web/src/lib/session.ts` — AppSessionData の型変更
- `apps/web/src/lib/gmail-server.ts` — D1からトークン取得に変更
- `apps/web/src/routes/oauth/callback.tsx` — 3パターン分岐
- `apps/web/src/routes/api/auth/start.ts` — 追加モード対応
- `apps/web/src/routes/api/accounts/index.ts` — D1ベースに変更
- `apps/web/src/routes/index.tsx` — 未ログイン時のリダイレクト
- `apps/web/wrangler.jsonc` — D1バインディング追加

### 変更なし

- `packages/core/` — 型定義・ストア・アダプターは変更不要
- `packages/ui/` — UIコンポーネントは変更不要
- `apps/web/src/routes/api/threads/` — gmailFetch のインターフェースは維持
