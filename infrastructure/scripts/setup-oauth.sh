#!/usr/bin/env bash
#
# OAuth 同意画面とクライアント ID のセットアップ。
#
# 背景: Terraform Google Provider には OAuth 同意画面（Google Auth Platform）と
# OAuth クライアント ID に対応するリソースがないため、gcloud CLI で管理する。
# https://github.com/hashicorp/terraform-provider-google/issues/7753
#
# このスクリプトは冪等（何度実行しても安全）。
#
# 前提:
#   - gcloud CLI がインストール・認証済みであること
#   - GCP_PROJECT_ID 環境変数が設定されていること
#
# 使い方:
#   GCP_PROJECT_ID=unified-email-client ./infrastructure/scripts/setup-oauth.sh

set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID を設定してください}"

echo "=== OAuth セットアップ ==="
echo "Project: ${GCP_PROJECT_ID}"
echo ""

# ------------------------------------------------------------------
# 1. OAuth 同意画面（OAuth ブランド）
# ------------------------------------------------------------------
# 注意: gcloud にはOAuth同意画面を直接作成するコマンドがない。
# Google Auth Platform の構成はコンソール UI から行う必要がある。
#
# 以下の設定が必要:
#   - アプリ名: VantageMail
#   - ユーザーサポートメール: (あなたのメールアドレス)
#   - 対象: 外部（External）
#   - テストモード（公開前は CASA 審査が必要）
#   - スコープ: gmail.modify, gmail.compose, gmail.labels
#
# コンソール URL:
echo "1. OAuth 同意画面をコンソールで設定してください:"
echo "   https://console.cloud.google.com/auth/overview?project=${GCP_PROJECT_ID}"
echo ""
echo "   設定内容:"
echo "   - アプリ名: VantageMail"
echo "   - ユーザーサポートメール: (あなたのメールアドレス)"
echo "   - 対象: 外部（External）"
echo "   - 公開ステータス: テスト"
echo ""

# ------------------------------------------------------------------
# 2. OAuth クライアント ID の作成
# ------------------------------------------------------------------
# Web アプリケーション用
echo "2. OAuth クライアント ID を作成..."
echo ""

# 既存のクライアントを確認
EXISTING_WEB=$(gcloud auth application-default print-access-token 2>/dev/null | head -1 || true)

echo "=== Web アプリケーション用クライアント ID ==="
echo ""
echo "コンソールから作成してください:"
echo "   https://console.cloud.google.com/auth/clients/create?project=${GCP_PROJECT_ID}"
echo ""
echo "   種類: Web アプリケーション"
echo "   名前: VantageMail Web"
echo "   承認済みの JavaScript 生成元:"
echo "     - http://localhost:5173 (開発)"
echo "     - https://vantagemail.onon.workers.dev (本番)"
echo "   承認済みのリダイレクト URI:"
echo "     - http://localhost:5173/oauth/callback (開発)"
echo "     - https://vantagemail.onon.workers.dev/oauth/callback (本番)"
echo ""

echo "=== デスクトップアプリ用クライアント ID ==="
echo ""
echo "   種類: デスクトップ アプリ"
echo "   名前: VantageMail Desktop"
echo ""

echo "=== 作成後に必要な作業 ==="
echo ""
echo "1. クライアント ID を packages/core の環境変数に設定"
echo "2. クライアントシークレットを Cloudflare Workers のシークレットに設定:"
echo "   cd workers/oauth-proxy && wrangler secret put GOOGLE_CLIENT_SECRET"
echo ""
echo "3. テストユーザーを追加（テストモードでは手動追加が必要）:"
echo "   https://console.cloud.google.com/auth/audience?project=${GCP_PROJECT_ID}"
