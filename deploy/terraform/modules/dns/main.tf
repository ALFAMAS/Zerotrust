variable "environment" { type = string }
variable "zone_name" { type = string }
variable "api_hostname" { type = string }
variable "app_hostname" { type = string }
variable "ingress_target" { type = string }

data "aws_route53_zone" "main" {
  name         = var.zone_name
  private_zone = false
}

resource "aws_route53_record" "api" {
  count   = var.ingress_target != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_hostname
  type    = "CNAME"
  ttl     = 300
  records = [var.ingress_target]
}

resource "aws_route53_record" "app" {
  count   = var.ingress_target != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.app_hostname
  type    = "CNAME"
  ttl     = 300
  records = [var.ingress_target]
}

output "record_fqdns" {
  value = compact([
    length(aws_route53_record.api) > 0 ? aws_route53_record.api[0].fqdn : null,
    length(aws_route53_record.app) > 0 ? aws_route53_record.app[0].fqdn : null,
  ])
}
