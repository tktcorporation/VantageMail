#!/usr/bin/env bash
# 既存 Gmail OAuth 設定の読み取り用チェックリスト。変更・認証操作は行わない。
set -euo pipefail

: "${GCP_PROJECT_ID:?照合対象の GCP_PROJECT_ID を設定してください}"

cat <<GUIDE
=== VantageMail Gmail OAuth の照合（読み取り専用） ===
Project: ${GCP_PROJECT_ID}

1. Google Auth Platform の既存設定を確認:
   クライアント: https://console.cloud.google.com/auth/clients?project=${GCP_PROJECT_ID}
   Audience: https://console.cloud.google.com/auth/audience?project=${GCP_PROJECT_ID}
   Data Access: https://console.cloud.google.com/auth/scopes?project=${GCP_PROJECT_ID}
   Overview: https://console.cloud.google.com/auth/overview?project=${GCP_PROJECT_ID}

2. Web client ID と実際のビルド値、Web client の redirect URI / 生成元を照合。
   コード: apps/web/.env.example、apps/web/src/lib/constants.ts
   redirect URI 未設定時は現在の request origin + /oauth/callback。
   稼働中のビルド設定は別途確認する。client secret の値は表示・記録しない。

3. Data Access のスコープと packages/core/src/gmail/oauth.ts の GMAIL_SCOPES を照合。
   Audience のテストユーザーと Publishing status も確認する。
   個人・少人数の利用と一般公開の審査要件を区別する。

4. Worker secret は apps/web の GOOGLE_CLIENT_SECRET の名前のみ確認。
   既存 client の再作成、Publishing status の変更、OpenTofu state への secret 移行はしない。

詳細: infrastructure/SETUP_VALUES.md
GUIDE
