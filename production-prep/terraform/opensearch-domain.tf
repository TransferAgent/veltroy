provider "aws" {
  region = "us-east-1"
}

resource "aws_opensearch_domain" "ndr_platform" {
  domain_name    = "ndr-platform"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type  = "t3.small.search"
    instance_count = 1
  }

  ebs_options {
    ebs_enabled = true
    volume_size = 20
    volume_type = "gp3"
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = var.opensearch_master_user
      master_user_password = var.opensearch_master_password
    }
  }

  tags = {
    Environment = "production"
    Platform    = "ndr"
    Blueprint   = "v1.2"
  }
}

variable "opensearch_master_user" {
  type      = string
  sensitive = true
}

variable "opensearch_master_password" {
  type      = string
  sensitive = true
}

# Index names (created via OpenSearch API after domain provisioning):
#   ndr-network
#   ndr-identity
#   ndr-correlated
#   ndr-dlq
#   ndr-tickets
#
# Tenant index pattern for production multi-tenancy:
#   ndr-{tenant_id}-{index}
#   Example: ndr-alpha-network, ndr-beta-correlated
