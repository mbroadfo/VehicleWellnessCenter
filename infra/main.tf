terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.21"
    }

    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}

variable "aws_region" {
  description = "AWS region for Vehicle Wellness Center infrastructure."
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Deployment environment tag (e.g., dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "mongodb_atlas_public_key" {
  description = "MongoDB Atlas programmatic public API key. Use environment variables or Parameter Store to populate in CI."
  type        = string
  default     = ""
}

variable "mongodb_atlas_private_key" {
  description = "MongoDB Atlas programmatic private API key."
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_project_id" {
  description = "Atlas project ID that contains the Vehicle Wellness Center deployment."
  type        = string
}

variable "mongodb_atlas_region" {
  description = "Atlas serverless deployment region (e.g., US_EAST_1)."
  type        = string
  default     = "US_EAST_1"
}

variable "mongodb_atlas_ip_access_list" {
  description = "CIDR blocks permitted to connect to Atlas. Leave empty to manage allow list manually."
  type        = list(string)
  default     = []
}

variable "mongodb_database_name" {
  description = "Logical database name to house Vehicle Wellness Center collections."
  type        = string
  default     = "vehicle_wellness_center"
}

variable "auth0_domain" {
  description = "Auth0 tenant domain (e.g., your-tenant.auth0.com)"
  type        = string
}

variable "auth0_audience" {
  description = "Auth0 API audience identifier (e.g., vwc-api or https://api.vehiclewellnesscenter.com)"
  type        = string
}

locals {
  vehicles_collection = {
    name = "vehicles"
    options = {
      validator = {
        "$jsonSchema" = {
          bsonType = "object"
          required = ["vin", "name", "acquiredAt"]
          properties = {
            vin = {
              bsonType    = "string"
              description = "Vehicle identification number"
              minLength   = 11
            }
            name = {
              bsonType    = "string"
              description = "Human-friendly vehicle name"
            }
            acquiredAt = {
              bsonType    = "date"
              description = "Acquisition timestamp"
            }
            acquiredFrom = {
              bsonType = ["object", "null"]
            }
            initialOdometer = {
              bsonType = ["int", "long", "double"]
              minimum  = 0
            }
            currentOdometer = {
              bsonType = ["int", "long", "double"]
              minimum  = 0
            }
            attributes = {
              bsonType = "object"
            }
            valuation = {
              bsonType = ["object", "null"]
              properties = {
                amount   = { bsonType = ["double", "decimal", "int", "long"] }
                currency = { bsonType = "string" }
                source   = { bsonType = "string" }
                asOf     = { bsonType = "date" }
              }
            }
            ownership = {
              bsonType = ["object", "null"]
              properties = {
                ownerId        = { bsonType = "string" }
                ownerName      = { bsonType = "string" }
                garageLocation = { bsonType = "string" }
              }
            }
            tags = {
              bsonType = ["array", "null"]
              items    = { bsonType = "string" }
            }
            createdAt = {
              bsonType = ["date", "null"]
            }
            updatedAt = {
              bsonType = ["date", "null"]
            }
          }
        }
      }
      validationAction = "warn"
    }
    indexes = [
      {
        keys = {
          vin = 1
        }
        options = {
          name   = "uk_vehicle_vin"
          unique = true
        }
      },
      {
        keys = {
          ownerId = 1
          vin     = 1
        }
        options = {
          name = "ix_vehicle_owner_vin"
        }
      }
    ]
  }

  fleets_collection = {
    name = "fleets"
    options = {
      validator = {
        "$jsonSchema" = {
          bsonType = "object"
          required = ["name", "ownerId"]
          properties = {
            name = {
              bsonType    = "string"
              description = "Fleet name"
            }
            ownerId = {
              bsonType    = "string"
              description = "Fleet owner identifier"
            }
            description = {
              bsonType = ["string", "null"]
            }
            vehicleIds = {
              bsonType    = ["array", "null"]
              items       = { bsonType = "objectId" }
              description = "Array of vehicle._id references"
            }
            tags = {
              bsonType = ["array", "null"]
              items    = { bsonType = "string" }
            }
            createdAt = {
              bsonType = ["date", "null"]
            }
            updatedAt = {
              bsonType = ["date", "null"]
            }
          }
        }
      }
      validationAction = "warn"
    }
    indexes = [
      {
        keys = {
          ownerId = 1
          name    = 1
        }
        options = {
          name = "ix_fleet_owner_name"
        }
      }
    ]
  }

  vehicle_events_collection = {
    name = "vehicleEvents"
    options = {
      validator = {
        "$jsonSchema" = {
          bsonType = "object"
          required = ["vehicleId", "occurredAt", "type", "summary"]
          properties = {
            vehicleId = {
              bsonType    = "objectId"
              description = "Reference to vehicles._id"
            }
            occurredAt = {
              bsonType    = "date"
              description = "When the event happened"
            }
            recordedAt = {
              bsonType = ["date", "null"]
            }
            location = {
              bsonType = ["object", "null"]
            }
            type = {
              bsonType    = "string"
              description = "Event taxonomy identifier"
            }
            emoji = {
              bsonType = ["string", "null"]
            }
            summary = {
              bsonType    = "string"
              description = "Timeline headline"
            }
            details = {
              bsonType = ["object", "null"]
            }
            source = {
              bsonType = ["object", "null"]
            }
            forecast = {
              bsonType = ["object", "null"]
            }
            createdBy = {
              bsonType = ["object", "null"]
            }
            createdAt = {
              bsonType = ["date", "null"]
            }
            updatedAt = {
              bsonType = ["date", "null"]
            }
          }
        }
      }
      validationAction = "warn"
    }
    indexes = [
      {
        keys = {
          vehicleId  = 1
          occurredAt = -1
        }
        options = {
          name = "ix_vehicle_timeline"
        }
      },
      {
        keys = {
          type       = 1
          occurredAt = -1
        }
        options = {
          name = "ix_event_type_time"
        }
      }
    ]
  }

  mongodb_initializer = templatefile(
    "${path.module}/collections-init.js.tftpl",
    {
      database_name             = var.mongodb_database_name
      vehicles_definition       = jsonencode(local.vehicles_collection)
      fleets_definition         = jsonencode(local.fleets_collection)
      vehicle_events_definition = jsonencode(local.vehicle_events_collection)
    }
  )
}

resource "local_file" "mongodb_collections_initializer" {
  filename = "${path.module}/collections-init.js"
  content  = local.mongodb_initializer
}

resource "mongodbatlas_project_ip_access_list" "ingress" {
  for_each = toset(var.mongodb_atlas_ip_access_list)

  project_id = var.mongodb_atlas_project_id
  cidr_block = each.value
  comment    = "Vehicle Wellness Center access"
}

resource "mongodbatlas_cluster" "vehicle" {
  project_id = var.mongodb_atlas_project_id
  name       = "vehicalwellnesscenter-cluster"

  # Free tier M0 cluster
  cluster_type = "REPLICASET"

  provider_name               = "TENANT"
  backing_provider_name       = "AWS"
  provider_region_name        = "US_WEST_2"
  provider_instance_size_name = "M0"

  # M0 clusters use auto-scaling for free
  auto_scaling_disk_gb_enabled = false
}

# MongoDB database user is managed manually via Atlas UI
# User: vwc_admin_db_user
# Role: readWriteAnyDatabase@admin
# Credentials stored in Parameter Store: /vwc/dev/secrets
# Note: Previously managed by Terraform, now manual to avoid accidental deletion

output "mongodb_connection_strings" {
  description = "MongoDB SRV connection strings for the Vehicle Wellness Center cluster."
  value = {
    srv      = mongodbatlas_cluster.vehicle.connection_strings[0].standard_srv
    standard = mongodbatlas_cluster.vehicle.connection_strings[0].standard
  }
  sensitive = true
}

output "mongodb_collection_initializer_script" {
  description = "Path to the generated Mongo shell script that creates Vehicle Wellness Center collections and indexes."
  value       = local_file.mongodb_collections_initializer.filename
}

# ============================================================================
# AWS Lambda Execution Role
# ============================================================================

resource "aws_iam_role" "vwc_lambda_exec" {
  name = "vwc-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy" "vwc_lambda_secrets" {
  name = "vwc-lambda-secrets-access"
  role = aws_iam_role.vwc_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = aws_ssm_parameter.auth0_token_cache.arn
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter" # Read-only for application secrets
        Resource = aws_ssm_parameter.application_secrets.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "vwc_lambda_basic" {
  role       = aws_iam_role.vwc_lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

output "lambda_execution_role_arn" {
  description = "ARN of the IAM role for Lambda function execution"
  value       = aws_iam_role.vwc_lambda_exec.arn
}

# ============================================================================
# Parameter Store - Auth0 Token Cache
# ============================================================================
# Stores Auth0 M2M bearer token with expiration metadata for sharing across
# all Lambda container instances. Eliminates redundant Auth0 token requests.
# ============================================================================

resource "aws_ssm_parameter" "auth0_token_cache" {
  name        = "/vwc/${var.environment}/auth0-token-cache"
  description = "Cached Auth0 M2M bearer token with expiration metadata (format: token|expiresAt)"
  type        = "String"
  value       = "not-initialized|0" # Placeholder - Lambda manages at runtime
  tier        = "Standard"

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    ignore_changes = [value, description] # Lambda updates these at runtime
  }
}

# ============================================================================
# Parameter Store - Application Secrets
# ============================================================================
# Stores all application secrets (MongoDB, Auth0, Gemini) in a single
# SecureString parameter for application secrets.
# Cost: FREE (Standard tier, <4KB)
# ============================================================================

resource "aws_ssm_parameter" "application_secrets" {
  name        = "/vwc/${var.environment}/secrets"
  description = "Application secrets for Vehicle Wellness Center (MongoDB, Auth0, Gemini)"
  type        = "SecureString" # Encrypted at rest with AWS KMS
  value = jsonencode({
    MONGODB_ATLAS_HOST      = "not-initialized"
    MONGODB_ATLAS_USERNAME  = "not-initialized"
    MONGODB_ATLAS_PASSWORD  = "not-initialized"
    AUTH0_DOMAIN            = "not-initialized"
    AUTH0_AUDIENCE          = "not-initialized"
    AUTH0_M2M_CLIENT_ID     = "not-initialized"
    AUTH0_M2M_CLIENT_SECRET = "not-initialized"
    GOOGLE_GEMINI_API_KEY   = "not-initialized"
  })
  tier = "Standard" # Free tier

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "Application secrets storage"
  }

  lifecycle {
    ignore_changes = [value, description] # User manages values manually
  }
}

# ============================================================================
# Unified Lambda Function
# ============================================================================
# Single Lambda with router handles all endpoints:
# - GET /vehicles/{vehicleId}/overview
# - GET /vehicles/{vehicleId}/events
# - POST /vehicles/{vehicleId}/events
# - POST /ai/chat
#
# Benefits:
# - Shared MongoDB connection pool
# - Single cold start overhead
# - Simpler infrastructure management
# - Lower cost
# ============================================================================

resource "aws_lambda_function" "vwc" {
  filename      = "${path.module}/lambda-vwc.zip"
  function_name = "vwc-${var.environment}"
  role          = aws_iam_role.vwc_lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 60 # Increased for AI processing + API calls
  memory_size   = 512

  source_code_hash = filebase64sha256("${path.module}/lambda-vwc.zip")

  environment {
    variables = {
      SSM_SECRETS_PARAMETER_NAME = aws_ssm_parameter.application_secrets.name
      MONGODB_DATABASE           = var.mongodb_database_name
      LAMBDA_APP_URL             = aws_apigatewayv2_api.vwc_api.api_endpoint
      NODE_ENV                   = var.environment
      AUTH0_TOKEN_PARAMETER_NAME = aws_ssm_parameter.auth0_token_cache.name
    }
  }

  tags = {
    Name        = "vwc-unified-${var.environment}"
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  depends_on = [aws_cloudwatch_log_group.vwc]
}

resource "aws_cloudwatch_log_group" "vwc" {
  name              = "/aws/lambda/vwc-${var.environment}"
  retention_in_days = 3

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ============================================================================
# API Gateway (HTTP API)
# ============================================================================

resource "aws_apigatewayv2_api" "vwc_api" {
  name          = "vwc-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "Vehicle Wellness Center API"

  cors_configuration {
    allow_origins = ["*"] # TODO: Restrict to frontend domain in production
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# JWT Authorizer for API Gateway (Auth0)
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.vwc_api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "vwc-jwt-authorizer-${var.environment}"

  jwt_configuration {
    audience = [var.auth0_audience]
    issuer   = "https://${var.auth0_domain}/"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.vwc_api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/vwc-api-${var.environment}"
  retention_in_days = 3

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# CloudWatch Logs resource policy to allow API Gateway to write logs
resource "aws_cloudwatch_log_resource_policy" "api_gateway" {
  policy_name = "vwc-apigateway-logging-policy"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.api_gateway.arn}:*"
      }
    ]
  })
}

# ============================================================================
# API Gateway Integration (Unified)
# ============================================================================
# Single integration for all routes - router dispatches internally

resource "aws_apigatewayv2_integration" "vwc" {
  api_id                 = aws_apigatewayv2_api.vwc_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.vwc.invoke_arn
  payload_format_version = "2.0"
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway_vwc" {
  statement_id  = "AllowAPIGatewayInvokeVWC"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.vwc.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.vwc_api.execution_arn}/*/*"
}

# ============================================================================
# API Routes (All point to unified Lambda)
# ============================================================================

resource "aws_apigatewayv2_route" "list_vehicles" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "GET /vehicles"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "create_vehicle" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "POST /vehicles"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "delete_vehicle" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "DELETE /vehicles/{vehicleId}"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_vehicle_overview" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "GET /vehicles/{vehicleId}/overview"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "list_vehicle_events" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "GET /vehicles/{vehicleId}/events"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "record_vehicle_event" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "POST /vehicles/{vehicleId}/events"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "ai_chat" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "POST /ai/chat"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "enrich_vehicle" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "POST /vehicles/{vehicleId}/enrich"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_vehicle_safety" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "GET /vehicles/{vehicleId}/safety"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_conversation_messages" {
  api_id             = aws_apigatewayv2_api.vwc_api.id
  route_key          = "GET /conversations/{sessionId}/messages"
  target             = "integrations/${aws_apigatewayv2_integration.vwc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# ============================================================================
# S3 Bucket for Frontend Hosting
# ============================================================================

resource "aws_s3_bucket" "frontend" {
  bucket = "vwc-frontend-${var.environment}"

  tags = {
    Name        = "vwc-frontend-${var.environment}"
    Project     = "VehicleWellnessCenter"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "vwc-frontend-${var.environment}"
  description                       = "OAC for VWC frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA routing - return index.html for 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "vwc-frontend-${var.environment}"
    Project     = "VehicleWellnessCenter"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# S3 Bucket Policy for CloudFront
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# ============================================================================
# Outputs
# ============================================================================

output "api_gateway_url" {
  description = "URL for the API Gateway endpoint"
  value       = aws_apigatewayv2_api.vwc_api.api_endpoint
}

output "lambda_function_name" {
  description = "Name of the unified VWC Lambda function"
  value       = aws_lambda_function.vwc.function_name
}

output "lambda_function_arn" {
  description = "ARN of the unified VWC Lambda function"
  value       = aws_lambda_function.vwc.arn
}

output "cloudfront_url" {
  description = "CloudFront distribution URL for the frontend"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for invalidations"
  value       = aws_cloudfront_distribution.frontend.id
}

output "s3_bucket_name" {
  description = "S3 bucket name for frontend assets"
  value       = aws_s3_bucket.frontend.id
}
