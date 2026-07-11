variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "instance_class" { type = string }
variable "allocated_storage_gb" { type = number }
variable "database_name" { type = string }
variable "master_username" { type = string }
variable "master_password" { type = string, sensitive = true }
variable "read_replica_count" { type = number }

resource "aws_db_subnet_group" "main" {
  name       = "zerotrust-${var.environment}-pg"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "zerotrust-${var.environment}-pg-subnet"
  }
}

resource "aws_security_group" "postgres" {
  name        = "zerotrust-${var.environment}-postgres"
  description = "Postgres access from private subnets only"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "primary" {
  identifier             = "zerotrust-${var.environment}-pg"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage_gb
  db_name                = var.database_name
  username               = var.master_username
  password               = var.master_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false
  storage_encrypted      = true
  skip_final_snapshot    = var.environment != "production"
  backup_retention_period = var.environment == "production" ? 7 : 1

  tags = {
    Name = "zerotrust-${var.environment}-postgres"
  }
}

resource "aws_db_instance" "replica" {
  count                  = var.read_replica_count
  identifier             = "zerotrust-${var.environment}-pg-replica-${count.index + 1}"
  replicate_source_db    = aws_db_instance.primary.identifier
  instance_class         = var.instance_class
  publicly_accessible    = false
  skip_final_snapshot    = true

  tags = {
    Name = "zerotrust-${var.environment}-postgres-replica-${count.index + 1}"
  }
}

output "endpoint" {
  value = aws_db_instance.primary.address
}

output "read_replica_endpoints" {
  value = aws_db_instance.replica[*].address
}
