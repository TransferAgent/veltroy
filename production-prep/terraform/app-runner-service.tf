resource "aws_apprunner_service" "ndr_platform_prod" {
  service_name = "ndr-platform-prod"

  source_configuration {
    auto_deployments_enabled = false

    image_repository {
      image_identifier      = "${aws_ecr_repository.ndr_platform.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "8000"

        runtime_environment_variables = {
          DEPLOYMENT_STAGE  = "PRODUCTION"
          OPENSEARCH_HOST   = "PLACEHOLDER"
          DB_HOST           = "PLACEHOLDER"
          BLUEPRINT_VERSION = "v1.2"
        }
      }
    }

    authentication_configuration {
      access_role_arn = var.apprunner_ecr_access_role_arn
    }
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.ndr_platform.arn

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }

  tags = {
    Environment = "production"
    Blueprint   = "v1.2"
  }
}

resource "aws_apprunner_auto_scaling_configuration_version" "ndr_platform" {
  auto_scaling_configuration_name = "ndr-platform-scaling"

  min_size = 1
  max_size = 5
}

variable "apprunner_ecr_access_role_arn" {
  type = string
}
