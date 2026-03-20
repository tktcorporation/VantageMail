# Pub/Sub トピックとサブスクリプション
#
# 背景: Gmail の users.watch() API は GCP Pub/Sub トピックにしか
# 通知を送れないため、これが VantageMail の唯一の GCP 依存。
# push subscription の宛先を CF Worker にすることで、
# それ以降のデータフローは全て Cloudflare 内で完結する。

resource "google_pubsub_topic" "gmail_push" {
  name = "vantagemail-gmail-push"

  # メッセージ保持期間（デフォルト: 7日）
  # Gmail push 通知はリアルタイム処理するため長期保持は不要だが、
  # Worker 障害時のリカバリ用に一定期間は残す。
  message_retention_duration = "86400s" # 1日

  depends_on = [google_project_service.pubsub_api]
}

# Gmail API サービスアカウントにパブリッシュ権限を付与。
# Gmail は gmail-api-push@system.gserviceaccount.com からメッセージを送る。
# この権限がないと users.watch() が PERMISSION_DENIED を返す。
resource "google_pubsub_topic_iam_member" "gmail_publisher" {
  topic  = google_pubsub_topic.gmail_push.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:gmail-api-push@system.gserviceaccount.com"
}

# Push subscription（宛先: CF push-relay Worker）
# push_relay_url が設定されている場合のみ作成する。
# Worker 未デプロイ時はスキップし、デプロイ後に terraform apply で追加できる。
resource "google_pubsub_subscription" "gmail_push" {
  count = var.push_relay_url != "" ? 1 : 0

  name  = "vantagemail-gmail-push-sub"
  topic = google_pubsub_topic.gmail_push.id

  push_config {
    push_endpoint = "${var.push_relay_url}/push"
  }

  # 30秒以内に ack しないとリトライされる
  ack_deadline_seconds = 30

  # 未 ack メッセージの保持期間
  message_retention_duration = "600s" # 10分

  # デッドレタリング等は Phase 2 で検討
  # dead_letter_policy { ... }
}
