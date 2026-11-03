# VantageMail GCP インフラストラクチャ
#
# Gmail の users.watch() API が要求する Pub/Sub と、Gmail API の有効化を定義する。
# 実際の適用状況と state の所在は未確認。OAuth 同意画面・client は管理しない。
#
# Cloudflare 側の設定は apps/web/wrangler.jsonc 等で別途管理する。
# state を確認するまで plan / apply / import は行わない。

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
