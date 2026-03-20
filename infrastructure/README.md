# VantageMail インフラストラクチャ

## 設計原則: Cloudflare ファースト

**Cloudflare で完結させ、GCP は Gmail API が強制する部分のみ使う。**

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cloudflare（メイン）                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ CF Workers     │  │ Workers          │  │ Storage               │ │
│  │              │  │                  │  │                       │ │
│  │ Web App      │  │ oauth-proxy      │  │ KV: SYNC_STATE        │ │
│  │ (React+Vite) │  │ push-relay       │  │ KV: SCHEDULED_JOBS    │ │
│  │              │  │ scheduler        │  │ KV: WATCH_STATE        │ │
│  └──────┬───────┘  └──────┬───────────┘  │                       │ │
│         │                 │              │ Durable Objects:       │ │
│         │                 │              │ PushConnectionManager  │ │
│         │                 │              └───────────────────────┘ │
└─────────┼─────────────────┼─────────────────────────────────────────┘
          │                 │
          │ 直接通信         │ Pub/Sub push
          │                 │ subscription
          ▼                 ▼
┌──────────────────────────────────────────┐
│              Google Cloud                 │
│                                          │
│  ┌────────────────┐  ┌───────────────┐  │
│  │ Gmail API      │  │ Pub/Sub       │  │
│  │ (REST v1)      │  │ トピック×1     │  │
│  │                │◄─┤               │  │
│  │ メール読み書き  │  │ gmail-push    │  │
│  │ ラベル操作     │  │               │  │
│  │ 検索           │  └───────────────┘  │
│  └────────────────┘                      │
└──────────────────────────────────────────┘
```

## GCP 依存（最小限）

| GCP サービス | 用途 | なぜ必要か |
|-------------|------|-----------|
| Cloud Pub/Sub | Gmail プッシュ通知の受信 | `users.watch()` API が Pub/Sub を強制する。代替手段なし |

**GCP で必要なリソース:**
- Pub/Sub トピック × 1
- Pub/Sub push subscription × 1（宛先: CF Worker）

## Cloudflare サービス

| サービス | 用途 |
|---------|------|
| **Workers (Static Assets)** | Web アプリホスティング |
| **Workers** | oauth-proxy, push-relay, scheduler |
| **KV** | 同期状態、スケジュールジョブ、watch 状態 |
| **Durable Objects** | WebSocket 接続管理、リアルタイム通知ファンアウト |
| **Cron Triggers** | スヌーズ/送信予約の実行、Gmail watch() 再登録 |

## データフロー

### メール受信通知
```
Gmail → GCP Pub/Sub → CF push-relay Worker → Durable Object → WebSocket → クライアント
                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                       ここから先は全て Cloudflare 内
```

### メール操作（読み書き）
```
クライアント → Gmail API（直接通信。CF を経由しない）
```

### OAuth トークン交換
```
クライアント → CF oauth-proxy Worker → Google Token Endpoint
```

### スヌーズ/送信予約
```
クライアント → CF scheduler Worker (KV に保存)
Cron Trigger → scheduler Worker → push-relay Worker → WebSocket → クライアント
```

## ディレクトリ構成

```
infrastructure/
├── terraform/                  # GCP リソース管理（IaC）
│   ├── main.tf                 # プロバイダ設定
│   ├── variables.tf            # 変数定義
│   ├── apis.tf                 # API 有効化（Gmail, Pub/Sub）
│   ├── pubsub.tf               # Pub/Sub トピック + サブスクリプション
│   ├── data.tf                 # データソース
│   ├── outputs.tf              # 出力値
│   └── terraform.tfvars.example
├── scripts/
│   └── setup-oauth.sh          # OAuth 同意画面 + クライアント ID（手動操作ガイド）
└── README.md
```

## セットアップ手順

### 1. GCP リソース（Terraform）

Terraform で API 有効化、Pub/Sub トピック、IAM バインディングを管理する。

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を編集して gcp_project_id を設定

terraform init
terraform plan
terraform apply
```

push-relay Worker をデプロイした後、`push_relay_url` を設定して再度 apply すると
push subscription が作成される。

```bash
# terraform.tfvars に追記:
# push_relay_url = "https://vantagemail-push-relay.onon.workers.dev"
terraform apply
```

### 2. OAuth 同意画面 + クライアント ID（手動）

Terraform Google Provider に対応リソースがないため、コンソール UI で設定する。
ガイドスクリプトが手順を表示する。

```bash
GCP_PROJECT_ID=unified-email-client ./infrastructure/scripts/setup-oauth.sh
```

### 3. CF Workers デプロイ

KV namespace は Terraform で作成済み。出力された ID を各 wrangler.toml に設定する。

```bash
# KV namespace ID を確認
cd infrastructure/terraform
terraform output kv_sync_state_id
terraform output kv_scheduled_jobs_id
terraform output kv_watch_state_id
# → 各 wrangler.toml の [[kv_namespaces]] id に転記

# シークレット設定
cd workers/oauth-proxy && wrangler secret put GOOGLE_CLIENT_SECRET

# デプロイ
cd workers/oauth-proxy && wrangler deploy
cd workers/push-relay && wrangler deploy
cd workers/scheduler && wrangler deploy
```
