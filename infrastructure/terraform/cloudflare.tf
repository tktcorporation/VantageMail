# Cloudflare リソース管理
#
# 背景: Workers KV namespace、Workers の設定等を宣言的に管理する。
# Workers のコードデプロイ自体は wrangler deploy で行う（ビルド統合の都合上）。
# Terraform は「リソースの箱」を作り、wrangler が「中身」を入れる分担。
#
# KV namespace の ID は terraform output から取得して各 wrangler.toml に設定する。

# ─── KV Namespaces ───

resource "cloudflare_workers_kv_namespace" "sync_state" {
  account_id = var.cloudflare_account_id
  title      = "vantagemail-sync-state"
}

resource "cloudflare_workers_kv_namespace" "scheduled_jobs" {
  account_id = var.cloudflare_account_id
  title      = "vantagemail-scheduled-jobs"
}

resource "cloudflare_workers_kv_namespace" "watch_state" {
  account_id = var.cloudflare_account_id
  title      = "vantagemail-watch-state"
}
