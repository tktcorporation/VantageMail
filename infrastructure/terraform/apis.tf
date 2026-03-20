# GCP API の有効化
#
# 背景: Gmail API と Pub/Sub API は VantageMail の動作に必須。
# Gmail API はクライアントがメールの読み書きに直接使用し、
# Pub/Sub API は Gmail のプッシュ通知（users.watch()）に必要。

resource "google_project_service" "gmail_api" {
  service = "gmail.googleapis.com"

  # API を無効化しても依存リソースを壊さない
  disable_on_destroy = false
}

resource "google_project_service" "pubsub_api" {
  service = "pubsub.googleapis.com"

  disable_on_destroy = false
}
