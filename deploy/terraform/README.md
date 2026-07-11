# zerotrust Terraform / OpenTofu scaffold

Provider-agnostic **AWS default** with module stubs for VPC, managed Postgres (RDS +
read replicas), Redis (ElastiCache), S3 object storage, and Route 53 DNS. Fork for
GCP (Cloud SQL, Memorystore, GCS, Cloud DNS) or Azure by swapping module internals.

Aligned with [`docs/deployment.md`](../../docs/deployment.md) VPS hardening and
[`docs/reference-architecture.md`](../../docs/reference-architecture.md) Blueprint 3.

## Prerequisites

- Terraform ≥ 1.5 or OpenTofu ≥ 1.6
- AWS credentials with permissions for VPC, RDS, ElastiCache, S3, Route 53
- **No secrets in repo** — passwords via environment or `-var-file` (gitignored)

## Quick start

```bash
cd deploy/terraform

# Copy and fill (never commit terraform.tfvars with real secrets)
cp terraform.tfvars.example terraform.tfvars

export TF_VAR_postgres_master_password="$(openssl rand -base64 32)"

terraform init
terraform plan
terraform apply
```

After apply, wire outputs into Kubernetes secrets and `.env`:

| Output | Env var |
| --- | --- |
| `postgres_endpoint` | `DATABASE_URL` (app user — run `scripts/ops/setup-postgres-roles.sql` first) |
| `postgres_read_replica_endpoints[0]` | `DATABASE_URL_READ_REPLICA` |
| `redis_endpoint` | `REDIS_URL` |
| `object_storage_bucket` | S3 backup/upload config |

Set `dns_ingress_target` to your ingress load-balancer hostname after Helm install,
then re-apply to create CNAME records.

## Operator follow-ups

1. Create `terraform.tfvars` locally (see `terraform.tfvars.example`).
2. Configure remote state (S3 + DynamoDB lock) before production use.
3. Run Postgres role split per deployment.md § Postgres roles before pointing app pods.
4. Enable `DB_READ_REPLICA_STRICT=true` in production if you want driver-level read-only enforcement.

## GCP / Azure forks

Replace module sources in `main.tf`:

- **GCP:** `modules/postgres` → Cloud SQL; `modules/redis` → Memorystore; `modules/object_storage` → GCS bucket; `modules/dns` → Cloud DNS.
- **Azure:** Database for PostgreSQL Flexible Server, Azure Cache for Redis, Blob Storage, Azure DNS.

Module interfaces (`variables.tf` / `outputs.tf`) stay stable so root `main.tf` changes are minimal.
