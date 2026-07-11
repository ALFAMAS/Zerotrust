output "vpc_id" {
  value = module.network.vpc_id
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "postgres_endpoint" {
  description = "Primary DATABASE_URL host (app user created separately — see deployment.md § Postgres roles)"
  value       = module.postgres.endpoint
}

output "postgres_read_replica_endpoints" {
  description = "Read replica hosts for DATABASE_URL_READ_REPLICA"
  value       = module.postgres.read_replica_endpoints
}

output "redis_endpoint" {
  value = module.redis.endpoint
}

output "object_storage_bucket" {
  value = module.object_storage.bucket_name
}

output "dns_records" {
  value = module.dns.record_fqdns
}
