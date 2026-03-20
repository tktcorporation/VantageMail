# VantageMail GCP インフラストラクチャ
#
# 背景: VantageMail は Cloudflare ファーストのアーキテクチャだが、
# Gmail の users.watch() API が GCP Pub/Sub を強制するため、
# Pub/Sub トピック + push subscription が唯一の GCP 依存。
# OAuth 関連の API 有効化もここで管理する。
#
# 使い方:
#   cd infrastructure/terraform
#   terraform init
#   terraform plan
#   terraform apply
#
# 注意: OAuth 同意画面とクライアント ID は Terraform Google Provider に
# 対応リソースがないため、infrastructure/scripts/setup-oauth.sh で別途設定する。

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # 状態ファイルの保存先。チーム開発時は GCS バックエンドに切り替える。
  # backend "gcs" {
  #   bucket = "vantagemail-tfstate"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
