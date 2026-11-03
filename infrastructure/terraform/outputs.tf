output "pubsub_topic" {
  description = "Gmail watch() に渡す Pub/Sub トピックのフルパス"
  value       = google_pubsub_topic.gmail_push.id
}

output "pubsub_subscription" {
  description = "Push subscription 名（push_relay_url 未設定時は未作成の説明）"
  value       = var.push_relay_url != "" ? google_pubsub_subscription.gmail_push[0].id : "(未作成: push_relay_url 未設定)"
}

output "gcp_project_number" {
  description = "GCP プロジェクト番号（既存設定との照合用）"
  value       = data.google_project.current.number
}
