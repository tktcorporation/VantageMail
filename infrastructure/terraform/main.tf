# VantageMail GCP インフラストラクチャ
#
# 背景: VantageMail は Cloudflare ファーストのアーキテクチャだが、
# Gmail の users.watch() API が GCP Pub/Sub を強制するため、
# Pub/Sub トピック + push subscription が唯一の GCP 依存。
# OAuth 関連の API 有効化もここで管理する。
#
# Cloudflare リソース（KV namespace 等）は wrangler.toml で管理する。
# Terraform は GCP 専用。
#
# 使い方:
#   cd infrastructure/terraform
#   terraform init
#   terraform plan
#   terraform apply

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
