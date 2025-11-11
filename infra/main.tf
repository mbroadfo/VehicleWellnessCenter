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
  description = "MongoDB Atlas programmatic public API key. Use environment variables or a secrets manager to populate in CI."
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

variable "mongodb_database_user_secret_id" {
  description = "Secrets Manager identifier (ID or ARN) whose JSON payload supplies MongoDB username and password."
  type        = string
}

data "aws_secretsmanager_secret_version" "mongodb_database_user" {
  secret_id = var.mongodb_database_user_secret_id
}

locals {
  mongodb_app_credentials = try(
    jsondecode(nonsensitive(data.aws_secretsmanager_secret_version.mongodb_database_user.secret_string)),
    null
  )

  mongodb_app_username = try(local.mongodb_app_credentials.MONGODB_ATLAS_USERNAME, null)
  mongodb_app_password = try(local.mongodb_app_credentials.MONGODB_ATLAS_PASSWORD, null)

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

resource "mongodbatlas_database_user" "vehicle_app" {
  username           = local.mongodb_app_username
  password           = local.mongodb_app_password
  project_id         = var.mongodb_atlas_project_id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.mongodb_database_name
  }

  scopes {
    name = mongodbatlas_cluster.vehicle.name
    type = "CLUSTER"
  }
}

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
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = data.aws_secretsmanager_secret_version.mongodb_database_user.arn
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
