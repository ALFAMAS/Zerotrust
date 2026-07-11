terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "zerotrust"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# VPC + subnets
module "network" {
  source = "./modules/network"

  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
}

# Managed Postgres placeholder (RDS) — swap engine for Cloud SQL / Azure DB for PostgreSQL
module "postgres" {
  source = "./modules/postgres"

  environment           = var.environment
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  instance_class        = var.postgres_instance_class
  allocated_storage_gb  = var.postgres_allocated_storage_gb
  database_name         = var.postgres_database_name
  master_username       = var.postgres_master_username
  # Password supplied via TF_VAR_postgres_master_password — never commit
  master_password       = var.postgres_master_password
  read_replica_count    = var.postgres_read_replica_count
}

# Redis placeholder (ElastiCache) — swap for Memorystore / Azure Cache
module "redis" {
  source = "./modules/redis"

  environment        = var.environment
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  node_type          = var.redis_node_type
}

# S3-compatible object storage (backups + uploads)
module "object_storage" {
  source = "./modules/object_storage"

  environment = var.environment
  bucket_name = var.object_storage_bucket_name
}

# DNS scaffold (Route 53) — records point at your ingress load balancer
module "dns" {
  source = "./modules/dns"

  environment   = var.environment
  zone_name     = var.dns_zone_name
  api_hostname  = var.dns_api_hostname
  app_hostname  = var.dns_app_hostname
  # Set after ingress/LB is provisioned (Helm / cloud LB DNS name)
  ingress_target = var.dns_ingress_target
}
