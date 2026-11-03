# VantageMail インフラ構成と管理範囲

このディレクトリは **GCP 側の構成定義** と、OAuth 設定を確認するための手順を置く。定義がリポジトリにあることは、実環境への適用済みを意味しない。

## 現在のコードと管理主体

| 対象 | リポジトリ上の定義 | 管理・確認先 |
| --- | --- | --- |
| Gmail API / Pub/Sub API の有効化 | `terraform/apis.tf` | GCP。OpenTofu の state を特定してから管理範囲を確認 |
| Gmail 通知用トピック、Gmail publisher IAM、任意の push subscription | `terraform/pubsub.tf` | GCP。`push_relay_url` が空なら subscription は定義上 0 件 |
| OAuth 同意画面、Audience、Publishing status、OAuth クライアント | OpenTofu の管理外 | Google Auth Platform の Console で既存設定を確認 |
| Web アプリ、D1、Worker の環境変数と secret | `apps/web/wrangler.jsonc`、`apps/web/src` | Cloudflare。`GOOGLE_CLIENT_SECRET` 等の値を OpenTofu state に移さない |
| push relay / scheduler のコード | `workers/src` | コードのみ確認済み。このリポジトリには各 Worker の wrangler 設定がなく、配備状況は不明 |

現在の OAuth フローは `apps/web/src/routes/api/auth/start.ts` と `apps/web/src/routes/oauth/callback.tsx` にある。Gmail API 呼び出しも `apps/web/src/lib/gmail-server.ts` にある。古い `oauth-proxy` Worker を前提とした手順は現在の Web アプリに適用しない。

## OpenTofu の安全な検査

`terraform/` には backend ブロックがないため、設定上の既定はローカル state である。ただし、**実際に使われた state の所在と適用履歴は未確認**。リポジトリには state や backend 設定がなく、これだけで未適用とは判断できない。既存の state と管理主体を確認するまで `plan`、`apply`、`import` を実行しない。

以下は provider の取得と静的検査だけを行う。GCP の認証情報は不要。`.terraform/` は gitignore 対象とし、`.terraform.lock.hcl` はレビュー対象としてコミットする。

```bash
cd infrastructure/terraform
tofu init -backend=false -input=false -lockfile=readonly
tofu fmt -check -recursive
tofu validate -no-color
```

provider のバージョンを見直すときだけ、変更内容をレビューしてから `tofu providers lock -platform=linux_amd64 -platform=darwin_arm64` で lock を更新する。`terraform.tfvars`、state、credential はコミットしない。

実環境の管理を再開する前に、担当者が既存 state の保管場所、使用していた CLI / workspace、対象 GCP project、現存リソースとの対応を確認する。state が見つからない場合も、新しい state で既存リソースを作り直さない。

Gmail 通知には [Pub/Sub トピックと Gmail の publisher 権限](https://developers.google.com/workspace/gmail/api/guides/push)が必要。push subscription は Worker の公開エンドポイントと運用状態を確認してから扱う。

## OAuth の照合

`GCP_PROJECT_ID=unified-email-client ./infrastructure/scripts/setup-oauth.sh` は**読み取り用チェックリストを表示するだけ**で、認証トークンの取得やリソースの作成をしない。照合項目とコード上の参照先は [SETUP_VALUES.md](SETUP_VALUES.md) にまとめた。既存クライアントを推測で再作成しない。

Google Auth Platform の同意画面と Publishing status は Console 側の設定であり、IAP の brand / OAuth client リソースは Gmail OAuth の代替ではない。個人・少人数の利用と一般公開は検証要件が異なる。Testing のテストユーザー制限とオフライン認可の有効期限も [Google の Audience 説明](https://support.google.com/cloud/answer/15549945)で確認する。一般公開を検討するときは、使用スコープに対する [Google の検証要件](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)を別途確認する。
