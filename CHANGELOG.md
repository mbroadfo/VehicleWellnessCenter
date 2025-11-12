# Changelog

All notable changes to the Vehicle Wellness Center project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2025-01-22

### Added

- **Infrastructure**: Terraform configuration for MongoDB Atlas M0 free tier cluster (`vehicalwellnesscenter-cluster`) in us-west-2
- **Infrastructure**: IAM role `vwc-lambda-execution-role` with Secrets Manager and CloudWatch Logs permissions
- **Infrastructure**: IAM user `terraform-vwc` with CLI access keys and policies for infrastructure management
- **Backend**: TypeScript Lambda project with ESLint (flat config), Vitest, and workspace scripts
- **Backend**: MongoDB connection test utility (`test-connection.ts`) with AWS Secrets Manager integration
- **Backend**: Collection initialization script (`init-collections.ts`) for vehicles, fleets, and vehicleEvents
- **Data Model**: Three MongoDB collections with JSON schema validators and indexes:
  - `vehicles` – VIN (unique), ownerId+VIN compound index
  - `fleets` – Vehicle aggregator with ownerId+name compound index
  - `vehicleEvents` – Timeline with vehicleId+occurredAt and type+occurredAt indexes
- **Documentation**: Comprehensive README with workspace commands, architecture, and prerequisites
- **Documentation**: Data model specification (`docs/data-model.md`) with sample documents and dealer maintenance mapping
- **Documentation**: MongoDB Atlas setup guide (`docs/MongoDB-Atlas-Setup-Guide.md`)
- **Documentation**: Secrets Manager provisioning checklist (`docs/atlas-secrets-todo.md`)
- **Documentation**: Milestone commit checklist in `.github/copilot-instructions.md` for repeatable quality gates
- **DevOps**: NPM workspace monorepo structure with root-level commands for build/lint/test/typecheck
- **DevOps**: PowerShell scripts for AWS credentials and Terraform variable loading

### Infrastructure

- MongoDB Atlas M0 free tier cluster with 512 MB storage
- Database user `vwc_admin_db_user` with readWrite scope (imported to Terraform state)
- AWS Secrets Manager secret `vehical-wellness-center-dev` with denormalized credential structure
- Terraform template for mongosh collection initialization script

### Security

- All credentials stored in AWS Secrets Manager (no hardcoded values in source)
- IAM roles for Lambda execution (cloud native, no access keys in production)
- JSON schema validators on all collections with "warn" action for flexible development

## [Unreleased] - 2025-11-12

### Added - Lambda & API Gateway

- **Backend**: First Lambda function `getVehicleOverview` with comprehensive error handling and MongoDB queries
  - Returns vehicle details, total event count, and last 5 events
  - Validates vehicleId parameter and ObjectId format
  - Full unit test coverage (4 test cases covering 400/404/200 responses)
- **Backend**: Shared MongoDB connection module (`src/lib/mongodb.ts`) with Lambda container caching
  - Connection pooling (maxPoolSize: 10, minPoolSize: 1)
  - Retrieves credentials from AWS Secrets Manager
  - Reuses connections across Lambda invocations
- **Backend**: Pure Node.js Lambda build system (`scripts/build-lambda.js`) using archiver package
  - Creates ZIP deployment packages with compiled code and production dependencies
  - Replaces OS-specific PowerShell scripts for cross-platform compatibility
- **Backend**: Test data seeding utility (`src/seed-test-data.ts`)
  - Creates sample 2021 Honda Accord with 5 maintenance events
  - Cleanup-first pattern: removes existing test VIN before seeding
  - Upsert operations for idempotent execution
  - Auto-cleanup after 3 seconds (no manual intervention required)
  - Outputs test API URL for immediate validation
- **Infrastructure**: Lambda function resource with 512MB memory, 30s timeout, Node.js 20 runtime
- **Infrastructure**: API Gateway HTTP API v2 with CORS configuration
  - Route: `GET /vehicles/{vehicleId}/overview`
  - CloudWatch access logging with 3-day retention
  - CloudWatch Logs resource policy for API Gateway write permissions
- **Infrastructure**: CloudWatch log groups for Lambda and API Gateway (3-day retention)
- **Infrastructure**: Node.js credential loading script (`infra/load-tf-env.js`)
  - Loads AWS credentials and Terraform variables from Secrets Manager
  - Automatically changes to infra/ directory for Terraform commands
  - Replaces both `load-aws-credentials.ps1` and `load-terraform-vars.ps1`
- **DevOps**: NPM scripts for infrastructure management
  - `infra:init`, `infra:plan`, `infra:apply`, `infra:destroy` - Terraform operations
  - `deploy` - Build Lambda package and update function code (fast iteration)
  - `build:lambda` - Create Lambda deployment ZIP
- **DevOps**: Cross-platform environment variable handling using `cross-env` package
  - NPM scripts now set `AWS_PROFILE=terraform-vwc` inline
  - Works on Windows PowerShell, Mac/Linux bash
  - Applied to `test:connection`, `init:collections`, `seed:test` scripts
- **DevOps**: IAM policy `terraform-vwc-core` with comprehensive permissions (9 statement blocks)
  - IAM role management for vwc-* roles
  - PassRole permissions for lambda.amazonaws.com and apigateway.amazonaws.com
  - Lambda function management (19 actions)
  - API Gateway management (5 CRUD actions)
  - CloudWatch Logs management (log groups, retention, delivery, resource policies)
  - Secrets Manager read access

### Changed

- **Backend**: ESLint configuration updated to disable unsafe type rules for test files
- **Backend**: Seed script simplified - removed Ctrl+C requirement for cleanup
  - Now auto-cleans after brief pause instead of waiting for SIGINT
  - Improves developer experience and CI/CD compatibility
- **Infrastructure**: Auto-format Terraform files before plan/apply operations
  - `load-tf-env.js` now runs `terraform fmt` automatically
  - Ensures consistent code style without manual intervention
- **Infrastructure**: Simplified npm scripts - moved credential loading into wrapper script
- **Infrastructure**: Separated infra management (`infra:*`) from app deployment (`deploy`)
- **DevOps**: Eliminated all PowerShell dependencies - 100% Node.js tooling for cross-platform support

### Removed

- **DevOps**: Removed `load-aws-credentials.ps1` and `load-terraform-vars.ps1` (replaced by `load-tf-env.js`)

### Deployed Infrastructure

- API endpoint: `https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com`
- Lambda function: `vwc-getVehicleOverview-dev` (3.87 MB deployment package)
- Lambda execution role: `arn:aws:iam::491696534851:role/vwc-lambda-execution-role`
- CloudWatch log groups with 3-day retention for cost optimization
- MongoDB Atlas IP whitelist configured to allow Lambda connections (0.0.0.0/0)
- End-to-end validation: API endpoint returning vehicle overview data successfully

### Technical Notes

- Lambda package size: 3.87 MB (includes mongodb driver, AWS SDK, compiled TypeScript)
- API Gateway logging configured via CloudWatch Logs resource policy (HTTP API v2 pattern)
- IAM policy iteratively refined through multiple Terraform apply cycles
- Build system uses archiver v7.0.1 for reliable ZIP creation
- All tooling now Node.js-based for Windows/Mac/Linux compatibility
- Terraform files auto-formatted before plan/apply - no manual `terraform fmt` needed
