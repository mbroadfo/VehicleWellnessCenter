# Changelog

All notable changes to the Vehicle Wellness Center project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2025-11-13

### Added - POST Endpoint & Integration Tests

- **Backend**: `recordVehicleEvent` Lambda function (POST `/vehicles/{vehicleId}/events`)
  - Creates vehicle events with comprehensive validation (vehicleId, required fields, optional numeric types)
  - Validates ObjectId format, JSON parsing, required fields (type, occurredAt, summary)
  - Validates optional fields (cost must be positive number, mileage must be positive integer)
  - Checks vehicle existence before creating event (returns 404 if not found)
  - Builds event document with nested details/source structure
  - Returns 201 with eventId on success, appropriate 400/404/500 errors
  - JWT-protected via Auth0 (401 without valid token)
- **Tests**: Comprehensive unit tests for `recordVehicleEvent` (9 validation tests)
  - Tests missing/invalid vehicleId, missing body, invalid JSON
  - Tests missing required fields (type, occurredAt, summary)
  - Tests invalid date format, negative cost, non-integer mileage
  - All validation tests passing
- **Tests**: Full API integration test suite (`api-integration.test.ts`) with 17 tests
  - Phase 1: Creates test vehicle and 3 events via POST API
  - Phase 2: Validates data via GET endpoints (overview, events list)
  - Phase 3: Updates data and verifies changes
  - Phase 4: Tests authentication (401), validation errors (400), non-existent vehicles (404)
  - Phase 5: Cleans up all test data via MongoDB
  - Self-contained: creates and removes own test data, safe to run repeatedly
  - Runs in ~3-4 seconds with proper cleanup even on test failures
  - **Automatic Auth0 token retrieval**: No manual token setup required
- **Auth0**: M2M (Machine-to-Machine) application integration for automated testing
  - Client Credentials flow implementation in `lib/auth0.ts`
  - Token caching with 5-minute expiration buffer (reduces Auth0 API calls)
  - Tokens cached in Lambda container memory (survives ~15-45 minutes)
  - Integration tests automatically fetch tokens via M2M credentials from Secrets Manager
  - Eliminates manual token copying from Auth0 dashboard
- **Infrastructure**: recordVehicleEvent Lambda, API Gateway POST route, CloudWatch logs
  - Lambda: 512MB memory, 30s timeout, JWT authentication required
  - Route: `POST /vehicles/{vehicleId}/events` with authorization_type="JWT"
  - Package: 3.89 MB deployment artifact
- **DevOps**: All tests run with AWS credentials automatically (`npm run test`)
  - Uses `terraform-vwc` AWS profile for MongoDB and Secrets Manager access
  - No manual AUTH0_TOKEN environment variable needed
  - Comprehensive README in `backend/tests/README-integration.md`
- **Documentation**: Parameter Store token caching design document
  - Job jar entry: `docs/job-jar-parameter-store-token-cache.md`
  - Future enhancement for shared token cache across Lambda containers
  - Complete Terraform configuration and implementation plan
  - Free tier solution using AWS Systems Manager Parameter Store
- **Utilities**: Updated `seed-test-data.ts` to disable auto-cleanup
  - Leaves test data in database for manual API testing
  - Shows both overview and events URLs
  - Auto-cleanup can be re-enabled by uncommenting cleanup section

### Changed

- All three Lambda functions now deployed and JWT-protected:
  - `vwc-getVehicleOverview-dev` (GET `/vehicles/{vehicleId}/overview`)
  - `vwc-listVehicleEvents-dev` (GET `/vehicles/{vehicleId}/events`)
  - `vwc-recordVehicleEvent-dev` (POST `/vehicles/{vehicleId}/events`)
- Secrets Manager schema expanded to include Auth0 M2M credentials
  - Added `AUTH0_M2M_CLIENT_ID` and `AUTH0_M2M_CLIENT_SECRET` fields
  - `AppSecrets` interface in `lib/mongodb.ts` now exports `getSecrets()` for reuse
  - Updated `infra/secret-example.json` with M2M credential placeholders
- Vitest configuration simplified (no test exclusions, all tests run with credentials)

### Testing

- Successfully tested POST endpoint with Auth0 token:
  - Created event with valid payload (eventId: 6916159d6abd942ccd1ef492)
  - Verified 404 for non-existent vehicle
  - Verified 400 for missing required fields
  - Verified 401 without authentication
  - Event correctly appears in GET endpoints after creation
- Integration test suite validates full lifecycle:
  - Create → Read → Update → Validate → Cleanup
  - All 17 tests passing consistently

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

## [Unreleased] - 2025-01-22 (continued)

### Added - JWT Authentication (Earlier Session)

- **Security**: Auth0 JWT authentication for API Gateway
  - JWT authorizer validates RS256 tokens from Auth0 tenant
  - Issuer: Auth0 tenant domain (configured via AWS Secrets Manager)
  - Audience: `https://vehiclewellnesscenter/api`
  - Automatic public key validation via JWKS endpoint
- **Infrastructure**: Auth0 configuration variables (`auth0_domain`, `auth0_audience`)
  - Loaded from AWS Secrets Manager secret `vehical-wellness-center-dev`
  - Updated `load-tf-env.js` to inject Auth0 variables into Terraform
- **Documentation**: Complete Auth0 setup guide (`docs/Auth0-Setup-Guide.md`)
  - Tenant creation, API configuration, token generation instructions
  - Testing examples for PowerShell, curl, JavaScript
  - Troubleshooting guide for common auth issues
- **Documentation**: Quick reference for AWS secret updates (`docs/auth0-secrets-todo.md`)
- **Infrastructure**: Terraform variables template (`infra/terraform.tfvars.example`)

### Changed - API Security

- **API Gateway**: All routes now require JWT authorization
  - `GET /vehicles/{vehicleId}/overview` - protected
  - `GET /vehicles/{vehicleId}/events` - protected
  - Unauthorized requests return 401 with `{"message":"Unauthorized"}`
- **Security**: Removed custom JWT generation script (not needed with Auth0)

### Infrastructure Updates

- AWS API Gateway HTTP API v2 JWT authorizer created
- Both Lambda routes updated with `authorization_type = "JWT"`
- CloudWatch API Gateway logs show authorization status (401 vs 404/200)

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
- **Backend**: Lambda function `listVehicleEvents` for paginated event retrieval
  - Route: `GET /vehicles/{vehicleId}/events`
  - Query parameters: limit (max 100), offset, type (event type filter)
  - Returns paginated events sorted by date (newest first)
  - Includes pagination metadata (totalCount, hasMore, nextOffset)
  - Full input validation with unit tests
- **Backend**: Test data seeding utility (`src/seed-test-data.ts`)
  - Creates sample 2021 Honda Accord with 5 maintenance events
  - Cleanup-first pattern: removes existing test VIN before seeding
  - Upsert operations for idempotent execution
  - Auto-cleanup after 3 seconds with proper process termination
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

### Changed - Backend & Infrastructure

- **Backend**: ESLint configuration updated to disable unsafe type rules for test files
- **Backend**: Seed script improvements
  - Removed Ctrl+C requirement - now auto-cleans after brief pause
  - Fixed hanging issue - properly exits with `process.exit(0)` after cleanup
  - Improves developer experience and CI/CD compatibility
- **Backend**: Lambda build system now accepts function name as parameter
  - Supports building multiple Lambda functions from single script
  - Usage: `node build-lambda.js <functionName>`
- **Infrastructure**: Auto-format Terraform files before plan/apply operations
  - `load-tf-env.js` now runs `terraform fmt` automatically
  - Ensures consistent code style without manual intervention
- **Infrastructure**: Simplified npm scripts - moved credential loading into wrapper script
- **Infrastructure**: Separated infra management (`infra:*`) from app deployment (`deploy`)
- **Infrastructure**: Added second Lambda function and API route to Terraform configuration
- **DevOps**: Eliminated all PowerShell dependencies - 100% Node.js tooling for cross-platform support
- **DevOps**: Root package.json now builds all Lambda functions via `build:lambda` script

### Removed

- **DevOps**: Removed `load-aws-credentials.ps1` and `load-terraform-vars.ps1` (replaced by `load-tf-env.js`)

### Deployed Infrastructure

- API endpoint: `https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com`
- Lambda functions:
  - `vwc-getVehicleOverview-dev` (3.88 MB deployment package)
  - `vwc-listVehicleEvents-dev` (3.88 MB deployment package)
- Lambda execution role: `arn:aws:iam::491696534851:role/vwc-lambda-execution-role`
- API routes:
  - `GET /vehicles/{vehicleId}/overview` - Vehicle summary with recent events
  - `GET /vehicles/{vehicleId}/events` - Paginated event list with filtering
- CloudWatch log groups with 3-day retention for cost optimization
- MongoDB Atlas IP whitelist configured to allow Lambda connections (0.0.0.0/0)
- End-to-end validation: Both API endpoints deployed and tested successfully

### Technical Notes

- Lambda package size: 3.87 MB (includes mongodb driver, AWS SDK, compiled TypeScript)
- API Gateway logging configured via CloudWatch Logs resource policy (HTTP API v2 pattern)
- IAM policy iteratively refined through multiple Terraform apply cycles
- Build system uses archiver v7.0.1 for reliable ZIP creation
- All tooling now Node.js-based for Windows/Mac/Linux compatibility
- Terraform files auto-formatted before plan/apply - no manual `terraform fmt` needed
