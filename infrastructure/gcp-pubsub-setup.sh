#!/usr/bin/env bash
#
# GCP Pub/Sub トピックとサブスクリプションの初期セットアップ。
#
# 背景: Gmail の users.watch() API は GCP Pub/Sub トピックにしか
# 通知を送れないため、これが唯一の GCP 依存。
# push subscription の宛先を CF Worker にすることで、
# それ以降のデータフローは全て Cloudflare 内で完結する。
#
# 前提: gcloud CLI がインストール・認証済みであること。
#
# 使い方:
#   GCP_PROJECT_ID=my-project PUSH_RELAY_URL=https://vantagemail-push-relay.workers.dev ./gcp-pubsub-setup.sh

set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID を設定してください}"
: "${PUSH_RELAY_URL:?PUSH_RELAY_URL を設定してください（例: https://vantagemail-push-relay.workers.dev）}"

TOPIC_NAME="vantagemail-gmail-push"
SUBSCRIPTION_NAME="vantagemail-gmail-push-sub"

echo "=== GCP Pub/Sub セットアップ（GCP依存はこれだけ）==="
echo "Project: ${GCP_PROJECT_ID}"
echo "Topic:   ${TOPIC_NAME}"
echo "Push先:  ${PUSH_RELAY_URL}/push"
echo ""

# 1. トピック作成
echo "1. トピックを作成..."
gcloud pubsub topics create "${TOPIC_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  2>/dev/null || echo "   (既に存在します)"

# 2. Gmail API サービスアカウントにパブリッシュ権限を付与
# Gmail は gmail-api-push@system.gserviceaccount.com からメッセージを送る
echo "2. Gmail API サービスアカウントに権限を付与..."
gcloud pubsub topics add-iam-policy-binding "${TOPIC_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  2>/dev/null || echo "   (既に設定済みです)"

# 3. Push subscription 作成（宛先: CF Worker）
echo "3. Push subscription を作成（宛先: CF Worker）..."
gcloud pubsub subscriptions create "${SUBSCRIPTION_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --topic="${TOPIC_NAME}" \
  --push-endpoint="${PUSH_RELAY_URL}/push" \
  --ack-deadline=30 \
  2>/dev/null || echo "   (既に存在します)"

echo ""
echo "=== 完了 ==="
echo ""
echo "Gmail watch() に渡すトピック名:"
echo "  projects/${GCP_PROJECT_ID}/topics/${TOPIC_NAME}"
echo ""
echo "この値を GOOGLE_PUBSUB_TOPIC 環境変数に設定してください。"
