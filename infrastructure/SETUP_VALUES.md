# 設定値の照合メモ

ここには秘密値を書かない。表は**コード上の参照先**であり、実際の GCP / Cloudflare 設定が一致していることの証明ではない。

## GCP と OpenTofu

| 非秘密の項目 | コード上の参照先 | 実環境で確認する場所 |
| --- | --- | --- |
| GCP project ID | `terraform/terraform.tfvars.example` の `gcp_project_id` は `unified-email-client` | 対象 GCP project と既存 state の管理履歴 |
| Gmail 通知 topic | `terraform/pubsub.tf` の `vantagemail-gmail-push` | GCP Pub/Sub。実在と state 上の管理有無を別々に確認 |
| push subscription | `push_relay_url` 設定時のみ定義 | GCP Pub/Sub。公開 endpoint と運用者を確認 |
| Gmail publisher IAM | `terraform/pubsub.tf` | topic の IAM と既存 state |

backend 設定と state はリポジトリにない。**state の所在は不明**。照合だけのために新規 state や OAuth client を作らない。Worker secret は state に入れない。

## Gmail OAuth（Google Auth Platform）

| 非秘密の項目 | コード上の参照先 | Console で確認する場所 |
| --- | --- | --- |
| Web OAuth client ID | `apps/web/.env.example` の `VITE_GOOGLE_CLIENT_ID`。実際のビルド値は別途確認 | [既存のクライアント](https://console.cloud.google.com/auth/clients?project=unified-email-client)の ID と種類 |
| 認可済み redirect URI | `apps/web/src/lib/constants.ts` の `VITE_OAUTH_REDIRECT_URI`。未設定なら request origin + `/oauth/callback` | 既存 Web client の redirect URI。開発・本番で実際の origin を確認 |
| JavaScript 生成元 | 実際の Web アプリ origin と `apps/web/wrangler.jsonc` の `ALLOWED_ORIGINS` | 既存 Web client の生成元。`ALLOWED_ORIGINS` は別用途なので一致を推測しない |
| 申請する OAuth scopes | `packages/core/src/gmail/oauth.ts` の `GMAIL_SCOPES` | [Data Access](https://console.cloud.google.com/auth/scopes?project=unified-email-client) と照合 |
| Audience、テストユーザー、Publishing status | アプリコードでは管理しない | [Audience](https://console.cloud.google.com/auth/audience?project=unified-email-client) と [Overview](https://console.cloud.google.com/auth/overview?project=unified-email-client) |

現在の `GMAIL_SCOPES` は `gmail.modify`、`gmail.compose`、`gmail.labels`、`userinfo.email`、`userinfo.profile`。変更や追加はこの手順の対象外。

個人・既知の少人数の利用は、[Google の検証例外](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)に該当する場合がある。一方、**Testing のオフライン認可は期限とテストユーザー制限がある**。[Audience の説明](https://support.google.com/cloud/answer/15549945)を確認し、個人利用だから Testing のままで永続運用できるとは見なさない。一般公開は必要なスコープの審査・要件を別途確認する。ここで Publishing status を切り替えない。

## Cloudflare Worker

| 項目 | コード上の参照先 | 確認先 |
| --- | --- | --- |
| `GOOGLE_CLIENT_SECRET` | `apps/web/wrangler.jsonc` のコメント、`apps/web/src/lib/services/ConfigService.ts` | Worker の secret 名があるか。値は出力・記録しない |
| `SERVER_SECRET` | `apps/web/src/lib/services/ConfigService.ts` で必須 | Worker の secret 名のみ確認。値は扱わない |
| `SESSION_SECRET` | `apps/web/src/lib/services/ConfigService.ts` と `apps/web/wrangler.jsonc` のコメント | Worker の secret 名のみ確認。値は扱わない |
| D1 binding | `apps/web/wrangler.jsonc` の `DB` | Cloudflare 側の既存設定 |

`VITE_*` はビルド時の値なので、Cloudflare の実行時変数だけを見ても稼働中の client ID は確定しない。既存デプロイのビルド設定と Console の client ID を非秘密情報として照合する。OAuth client secret の表示・コピーや認証操作は不要。
