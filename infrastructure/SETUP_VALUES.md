# VantageMail セットアップ値一覧

全サービスで設定が必要な値を一覧化したもの。
**このファイルに実際のシークレットを書き込まないこと。**
値の取得先と設定先のマッピングを示す。

---

## 1. GCP（Google Cloud）

### 確定済み

| 値 | 内容 | 設定先 |
|---|---|---|
| `unified-email-client` | GCP プロジェクト ID | `terraform.tfvars` → `gcp_project_id` |
| `274158370731` | GCP プロジェクト番号 | 参考情報（自動取得可能） |

### GCP コンソールから取得

| 値 | 取得先 | 設定先 |
|---|---|---|
| OAuth クライアント ID | [GCP > Google Auth Platform > クライアント](https://console.cloud.google.com/auth/clients?project=unified-email-client) | `packages/core` のクライアント設定, `.env` |
| OAuth クライアントシークレット | 同上（クライアント詳細画面） | `wrangler secret put GOOGLE_CLIENT_SECRET`（oauth-proxy Worker） |

### 作成済みの OAuth クライアント

| フィールド | 値 |
|---|---|
| 名前 | VantageMail Web |
| 種類 | ウェブ アプリケーション |
| クライアント ID | `<GCP コンソールから取得>` |
| クライアントシークレット | GCP コンソールで確認 → `wrangler secret put` で設定 |
| JS 生成元 | `http://localhost:5173`, `https://vantagemail.onon.workers.dev` |
| リダイレクト URI | `http://localhost:5173/oauth/callback`, `https://vantagemail.onon.workers.dev/oauth/callback` |

---

## 2. Cloudflare

### ダッシュボードから取得

| 値 | 取得先 | 設定先 |
|---|---|---|
| Account ID | [CF ダッシュボード](https://dash.cloudflare.com/) → URL `https://dash.cloudflare.com/<account_id>` | `terraform.tfvars` → `cloudflare_account_id` |
| API トークン | [CF > My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens) → 新規作成 | 環境変数 `CLOUDFLARE_API_TOKEN` |

#### API トークンに必要な権限

```
Account > Workers KV Storage > Edit
Account > Workers Scripts > Edit    # Workers デプロイ時に必要
```

### Terraform apply 後に出力される値

| 値 | 設定先 |
|---|---|
| `kv_sync_state_id` | `workers/push-relay/wrangler.toml` → `[[kv_namespaces]]` の `id` |
| `kv_scheduled_jobs_id` | `workers/scheduler/wrangler.toml` → `[[kv_namespaces]]` の `id` |
| `kv_watch_state_id` | `workers/oauth-proxy/wrangler.toml` → `[[kv_namespaces]]` の `id` |

---

## 3. Workers のシークレット（`wrangler secret put`）

| Worker | シークレット名 | 値の出所 |
|---|---|---|
| `oauth-proxy` | `GOOGLE_CLIENT_SECRET` | GCP > OAuth クライアント詳細 |

```bash
# 本番（Cloudflare に暗号化保存）
cd workers/oauth-proxy
wrangler secret put GOOGLE_CLIENT_SECRET

# ローカル開発（wrangler dev が自動で読む、gitignore 済み）
cd workers/oauth-proxy
cp .dev.vars.example .dev.vars
# .dev.vars を編集して GOOGLE_CLIENT_SECRET を設定
```

---

## 4. クライアントアプリ（Vite 環境変数）

`apps/web/.env.local`（未作成 → 作成が必要）:

```env
# OAuth
VITE_GOOGLE_CLIENT_ID=<GCP コンソールから取得>
VITE_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback
VITE_OAUTH_PROXY_URL=http://localhost:8787

# Gmail Push
VITE_PUBSUB_TOPIC=projects/unified-email-client/topics/vantagemail-gmail-push
```

本番用は **CF Workers の Variables and Secrets** で設定（リポジトリにはコミットしない）:

CF ダッシュボード > Workers > vantagemail > Settings > Variables and Secrets に以下を設定:

| 変数名 | 値 |
|--------|---|
| `VITE_GOOGLE_CLIENT_ID` | GCP コンソールから取得 |
| `VITE_OAUTH_REDIRECT_URI` | `https://vantagemail.onon.workers.dev/oauth/callback` |
| `VITE_OAUTH_PROXY_URL` | `https://vantagemail-oauth.onon.workers.dev` |
| `VITE_PUBSUB_TOPIC` | `projects/unified-email-client/topics/vantagemail-gmail-push` |

Vite がビルド時に `import.meta.env` 経由で読み、JS にインライン埋め込みする。

---

## 5. Terraform 変数（`infrastructure/terraform/terraform.tfvars`）

```hcl
gcp_project_id        = "unified-email-client"
cloudflare_account_id = "<CF ダッシュボードから>"
push_relay_url        = ""  # push-relay デプロイ後に設定
```

```bash
# API トークンは環境変数で設定（tfvars に書かない）
export CLOUDFLARE_API_TOKEN="<CF API トークン>"
```

---

## セットアップ順序

```
1. terraform.tfvars を作成（GCP project ID + CF account ID）
2. CLOUDFLARE_API_TOKEN を環境変数に設定
3. terraform init && terraform apply
   → KV namespace ID が出力される
4. 出力された KV ID を各 wrangler.toml に転記
5. wrangler secret put GOOGLE_CLIENT_SECRET（oauth-proxy）
6. apps/web/.env.local を作成（ローカル開発用）
7. CF Workers (vantagemail) の Variables and Secrets に本番用の VITE_* 変数を設定
8. Workers デプロイ: wrangler deploy
9. push-relay デプロイ後、terraform.tfvars に push_relay_url を追記して再 apply
```

---

## URL 更新チェックリスト

`vantagemail.onon.workers.dev` から変わった場合、以下を全て更新すること:

- [ ] `apps/web/.env.production` → `VITE_OAUTH_REDIRECT_URI`
- [ ] `workers/oauth-proxy/wrangler.toml` → `ALLOWED_ORIGINS`
- [ ] `workers/push-relay/wrangler.toml` → `ALLOWED_ORIGINS`
- [ ] GCP OAuth クライアント → JS 生成元 + リダイレクト URI（[GCP コンソール](https://console.cloud.google.com/auth/clients?project=unified-email-client)）

---

## TODO（未完了）

- [ ] GCP コンソールでテストユーザーに `tktcorporation.go@gmail.com` を追加
  → https://console.cloud.google.com/auth/audience?project=unified-email-client
- [ ] GCP コンソールでクライアントシークレットを確認して `wrangler secret put` で設定
- [ ] Cloudflare Account ID を確認して terraform.tfvars に記入
- [ ] Cloudflare API Token を作成
- [ ] `terraform apply` を実行して KV namespace を作成
- [ ] KV namespace ID を各 wrangler.toml に転記
- [ ] `apps/web/.env.local` を作成
