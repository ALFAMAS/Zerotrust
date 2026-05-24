terraform {
  required_providers {
    zeroauth = {
      source  = "registry.terraform.io/alfamas/zeroauth"
      version = "~> 0.1"
    }
  }
}

provider "zeroauth" {
  base_url  = "https://auth.example.com"
  api_token = var.zeroauth_admin_token
}

resource "zeroauth_tenant" "acme" {
  slug         = "acme"
  name         = "Acme Corporation"
  display_name = "Acme Corp"
  plan         = "enterprise"
  mfa_required = true
  enforce_sso  = true
  session_ttl  = 28800
  max_users    = 500
}

resource "zeroauth_role" "admin" {
  name      = "admin"
  tenant_id = zeroauth_tenant.acme.id
  permissions = [
    "users:read", "users:write",
    "sessions:read", "sessions:revoke",
    "roles:read", "audit:read"
  ]
}

resource "zeroauth_role" "readonly" {
  name      = "readonly"
  tenant_id = zeroauth_tenant.acme.id
  permissions = ["users:read", "sessions:read", "audit:read"]
}

resource "zeroauth_webhook" "security_alerts" {
  url       = "https://hooks.acme.com/zeroauth"
  secret    = var.webhook_secret
  tenant_id = zeroauth_tenant.acme.id
  events    = ["anomaly.detected", "user.locked", "auth.brute_force", "jit.requested"]
  active    = true
}

variable "zeroauth_admin_token" {
  type      = string
  sensitive = true
}

variable "webhook_secret" {
  type      = string
  sensitive = true
}

output "tenant_id" {
  value = zeroauth_tenant.acme.id
}
