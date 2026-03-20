variable "gcp_project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP リージョン（Pub/Sub はグローバルだが provider のデフォルトとして設定）"
  type        = string
  default     = "asia-northeast1"
}

variable "cloudflare_account_id" {
  description = "Cloudflare アカウント ID（ダッシュボードの URL から取得）"
  type        = string
}

variable "cloudflare_api_token" {
  description = <<-EOT
    Cloudflare API トークン。
    必要な権限: Account > Workers KV Storage > Edit
    環境変数 CLOUDFLARE_API_TOKEN でも設定可能。
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "push_relay_url" {
  description = <<-EOT
    Cloudflare push-relay Worker の URL。
    Pub/Sub push subscription の宛先になる。
    Worker 未デプロイ時は空文字を指定すると subscription の作成をスキップする。
  EOT
  type        = string
  default     = ""
}
