variable "aws_region" {
  description = "AWS region (fork: set provider + modules for GCP/Azure equivalents)"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment label (staging, production)"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "postgres_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "postgres_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "postgres_database_name" {
  type    = string
  default = "zerotrust"
}

variable "postgres_master_username" {
  type    = string
  default = "zerotrust_admin"
}

variable "postgres_master_password" {
  description = "RDS master password — pass via TF_VAR_postgres_master_password or -var-file"
  type        = string
  sensitive   = true
}

variable "postgres_read_replica_count" {
  description = "Number of read replicas (maps to DATABASE_URL_READ_REPLICA)"
  type        = number
  default     = 1
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "object_storage_bucket_name" {
  type    = string
  default = "zerotrust-app-storage"
}

variable "dns_zone_name" {
  type    = string
  default = "example.com"
}

variable "dns_api_hostname" {
  type    = string
  default = "api.example.com"
}

variable "dns_app_hostname" {
  type    = string
  default = "example.com"
}

variable "dns_ingress_target" {
  description = "Ingress LB hostname (set after k8s ingress is live)"
  type        = string
  default     = ""
}
