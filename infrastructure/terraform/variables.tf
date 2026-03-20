variable "gcp_project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP リージョン（Pub/Sub はグローバルだが provider のデフォルトとして設定）"
  type        = string
  default     = "asia-northeast1"
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
