output "pubsub_topic" {
  description = "Gmail watch() に渡す Pub/Sub トピックのフルパス"
  value       = google_pubsub_topic.gmail_push.id
}

output "pubsub_subscription" {
  description = "Push subscription 名（push_relay_url 未設定時は空）"
  value       = var.push_relay_url != "" ? google_pubsub_subscription.gmail_push[0].id : "(未作成: push_relay_url を設定して terraform apply)"
}

output "gcp_project_number" {
  description = "GCP プロジェクト番号（OAuth クライアント設定で使用）"
  value       = data.google_project.current.number
}
