# Changelog

All notable changes to the Vehicle Wellness Center project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] - 2025-11-14

### Removed - Secrets Manager (Phase 6 Complete)

- **Backend**: Removed AWS Secrets Manager code from `mongodb.ts`
  - Simplified `getSecrets()` to single line calling Parameter Store
  - Removed imports: `SecretsManagerClient`, `GetSecretValueCommand`
  - Removed ~45 lines of legacy Secrets Manager retrieval code
  - Clean codebase - no dead code, no fallback complexity
- **Infrastructure**: Removed Secrets Manager from Terraform configuration
  - Removed data source: `aws_secretsmanager_secret_version.mongodb_database_user`
  - Removed variable: `mongodb_database_user_secret_id`
  - Updated Lambda IAM policy: removed `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` permissions
  - Removed Lambda environment variable: `AWS_SECRET_ID`
  - MongoDB user resource removed from Terraform (now managed manually in Atlas UI to prevent accidental deletion)
- **Infrastructure**: Fixed Terraform placeholder bug
  - Corrected `MONGODB_URI` → `MONGODB_ATLAS_HOST` in Parameter Store template
  - Ensures consistency between Terraform and actual Parameter Store structure
- **Cost Savings**: $4.80/year savings now fully realized
  - Secrets Manager completely removed from infrastructure
  - Parameter Store Standard tier (free) handling all application secrets
  - Migration from $0.40/month to $0.00/month for secret storage

### Fixed - MongoDB User Management

- **Database**: MongoDB user `vwc_admin_db_user` recreated manually after Terraform deletion
  - Role: `readWriteAnyDatabase@admin` (upgraded from scoped readWrite)
  - Managed in Atlas UI to prevent future accidental deletions during Terraform operations
  - Credentials match Parameter Store values exactly
  - All 35 tests passing with new user configuration

### Changed - Migration Status (Phase 6 → Phase 7)

- **Phase 6 Complete**: Secrets Manager fully removed from code and infrastructure
  - Lambda using Parameter Store exclusively (`SSM_SECRETS_PARAMETER_NAME` set)
  - All tests passing (35/35: 18 unit + 17 integration)
  - Code simplified, infrastructure cleaner, costs reduced
- **Next Phase**: Phase 7 will delete Secrets Manager secret with 7-day recovery window
- **Documentation**: Phase 6 completion notes added to migration plan

### Added - Secrets Manager to Parameter Store Migration Plan

- **Documentation**: Comprehensive 8-phase migration plan to replace AWS Secrets Manager with AWS Systems Manager Parameter Store for application secrets
  - **Cost optimization**: Eliminates $4.80/year Secrets Manager cost (100% savings for Standard tier Parameter Store)
  - **Security maintained**: Both solutions use KMS encryption (SecureString), IAM resource-level permissions, CloudTrail audit logs, and TLS in transit
  - **Zero-downtime approach**: Parallel operation with dual-read implementation ensures smooth cutover
  - **Rollback procedures**: Each phase includes specific rollback steps, 7-day recovery window for deleted secrets
  - **8 phases planned**: (1) Infrastructure foundation, (2) Dual-read implementation, (3) Manual population, (4) Testing & validation, (5) Documentation updates, (6) Remove Secrets Manager from Terraform, (7) Delete Secrets Manager secret, (8) Final cleanup
  - **6 milestone commits**: Aligned with phase completion for incremental progress tracking
  - **Modeled on success**: Based on recently completed Parameter Store token caching optimization (commit 99065c8)
  - Parameter format: Single JSON parameter `/vwc/dev/secrets` with all 7 credential fields (MongoDB, Auth0, Gemini)
  - New module specification: `backend/src/lib/parameterStore.ts` with `getSecretsFromParameterStore()`, `clearSecretsCache()` functions
  - Dual-read pattern: Environment variable `SSM_SECRETS_PARAMETER_NAME` switches between Parameter Store (primary) and Secrets Manager (fallback)
  - Timeline: 7-10 hours over 2-3 sessions
  - Documentation file: `docs/job-jar-secrets-to-parameter-store-migration.md`

### Added - Parameter Store Token Caching

- **Backend**: Two-tier Auth0 token caching system to minimize API calls and improve performance
  - **Tier 1**: Memory cache (fastest, container-specific, 0-1ms access time)
  - **Tier 2**: AWS Systems Manager Parameter Store (shared across all Lambda containers, 50-100ms access time)
  - **Tier 3**: Auth0 OAuth API (fallback, 500-1000ms when cache miss)
  - Token stored in format `token|expiresAt` (pipe-delimited) at `/vwc/dev/auth0-token-cache`
  - 5-minute expiration buffer prevents mid-request token expiry
  - Graceful degradation: Falls back to memory-only cache if Parameter Store unavailable
  - **70-90% reduction** in Auth0 API calls across all Lambda invocations
  - New functions: `clearMemoryCache()` for testing new container scenarios
- **Backend**: Auth0 module refactored with comprehensive SSM integration
  - New dependency: `@aws-sdk/client-ssm` (v3.931.0)
  - Functions: `getTokenFromParameterStore()`, `saveTokenToParameterStore()`, `fetchNewToken()`
  - Updated `getAuth0Token()` implements three-tier fallback pattern
  - Memory cache variable renamed from `cachedToken` to `memoryCache` for clarity
- **Backend**: Token caching test utility (`src/test-token-refresh.ts`)
  - Tests cold start (Auth0 fetch), memory cache hit, Parameter Store hit, forced refresh
  - Validates token sharing across simulated Lambda containers
  - Demonstrates performance gains: 12,655x faster (memory) and 4.5x faster (Parameter Store) vs Auth0
  - Auto-cleanup with `process.exit(0)` for CI/CD compatibility
- **Infrastructure**: Parameter Store resource for Auth0 token cache
  - Resource: `aws_ssm_parameter.auth0_token_cache` (Standard tier, free)
  - Name: `/vwc/dev/auth0-token-cache`
  - Initial value: `not-initialized|0` (Lambda manages at runtime)
  - Lifecycle: `ignore_changes` on value/description (Lambda controls updates)
  - Tags: Project, Environment, ManagedBy=Terraform
- **Infrastructure**: Lambda IAM permissions for Parameter Store access
  - Actions: `ssm:GetParameter`, `ssm:PutParameter` on token cache ARN
  - Added to existing `vwc_lambda_secrets` IAM role policy
  - Lambda environment variable: `AUTH0_TOKEN_PARAMETER_NAME=/vwc/dev/auth0-token-cache`
- **Infrastructure**: terraform-vwc IAM policy updated with SSM permissions
  - Two statements for security best practice:
    - `ParameterStoreManagement`: Resource-scoped actions (Get, Put, Delete, Tags) on `/vwc/*` parameters
    - `ParameterStoreDescribe`: Global `ssm:DescribeParameters` permission (required by Terraform aws_ssm_parameter resource)
  - File: `infra/terraform-vwc-core-policy-updated.json`

### Changed - Token Caching Architecture

- Auth0 token lifecycle now optimized for Lambda container reuse
  - Previously: Memory cache per container (15-45 min lifetime)
  - Now: Parameter Store shared cache + memory cache (persistent until expiry)
  - Benefit: New Lambda containers read from shared cache instead of calling Auth0
  - Cost impact: Zero (Standard Parameter Store is free tier)
- Lambda cold start performance improved for authenticated operations
  - First invocation: 189ms (Auth0 fetch) → subsequent: 42ms (Parameter Store) or 0.015ms (memory)
  - Warm containers: 0.015ms (memory cache hit)
  - Cross-container: 42ms (Parameter Store hit vs 189ms Auth0)

### Infrastructure Changes

- Terraform apply results:
  - Added: 1 resource (`aws_ssm_parameter.auth0_token_cache`)
  - Changed: 2 resources (Lambda function code + environment vars, IAM role policy)
  - Parameter Store created successfully at `/vwc/dev/auth0-token-cache`
- Lambda function updated with new source code hash (YacyINSsvuabnFGmyQj7phYSVaNKg+qsAcvksE31bOE=)
- All 35 tests passing (18 unit + 17 integration) with new caching system

### Performance Metrics

- Memory cache: 0.015ms (12,655x faster than Auth0)
- Parameter Store: 42ms (4.5x faster than Auth0)
- Auth0 API: 189-558ms (baseline)
- Expected production impact: 70-90% reduction in Auth0 token requests

### Changed - Single Lambda Architecture

- **Backend**: Consolidated 4 separate Lambda functions into 1 unified Lambda with router pattern
  - Router in `src/index.ts` dispatches requests based on HTTP method and path regex
  - All handlers moved to `src/routes/` directory (getVehicleOverview.ts, listVehicleEvents.ts, recordVehicleEvent.ts, aiChat.ts)
  - Shared connection pool and token cache across all routes (better performance, lower cold start impact)
  - All handlers now use `APIGatewayProxyEventV2` for consistency
  - Simplified architecture: 1 Lambda instead of 4 reduces complexity and cost
- **Infrastructure**: Terraform refactored from 4 Lambda resources to 1
  - Single Lambda function: `vwc-dev` (Node.js 20.x, 512 MB memory, 60s timeout)
  - Single API Gateway integration for all 4 routes
  - All routes (`GET /vehicles/{vehicleId}/overview`, `GET /vehicles/{vehicleId}/events`, `POST /vehicles/{vehicleId}/events`, `POST /ai/chat`) point to same Lambda
  - Deployment package: `lambda-vwc.zip` (4.03 MB)
- **AI Integration**: Gemini model updated to `gemini-2.5-flash`
  - Previous model `gemini-2.0-flash-exp` had free tier quota of 0
  - Updated based on user's Google AI console showing traffic for gemini-2.5-flash
  - AI chat endpoint working with function calling (AI successfully calls getVehicleOverview tool)
  - AI Data Curator pattern validated: AI calls existing CRUD endpoints via HTTP, validates data, provides natural responses
- **Build System**: Lambda build script simplified for single function
  - `backend/scripts/build-lambda.js` no longer requires function name parameter
  - Outputs single `lambda-vwc.zip` with all routes included
  - Root `package.json` updated with simplified `build:lambda` and `deploy` scripts
- **DevOps**: Streamlined deployment process
  - `npm run deploy` builds and updates single Lambda function
  - Faster deployments (no need to update 4 separate functions)
  - Simpler infrastructure state (16 resources destroyed, 4 added, 4 updated in consolidation)
- **Tests**: All test files updated for new architecture
  - Import paths changed from `./` to `./routes/` for handler functions
  - All handlers use V2 event types throughout
  - 35/35 tests passing (18 unit + 17 integration)

### Added - AI Chat Testing

- **Backend**: AI chat test utility (`src/test-ai-chat.ts`)
  - Validates AI endpoint with realistic queries
  - Tests function calling (AI calls getVehicleOverview tool)
  - Tests data validation (AI checks vehicle existence before operations)
  - Automatic Auth0 token retrieval (no manual setup)
  - Examples: "Tell me about this vehicle", "Add oil change event"

### Fixed

- **Configuration**: Updated `.gitignore` to properly exclude Terraform numbered backups
  - Added pattern `infra/terraform.tfstate.*.backup` to catch all backup files
  - Previously only excluded `terraform.tfstate.backup` (not numbered variants)

### Infrastructure Changes Made

- Terraform apply results:
  - Destroyed: 16 resources (4 old Lambdas + 4 old integrations + 4 old routes + 4 old log groups)
  - Added: 4 resources (1 new Lambda + 1 new integration + 1 new log group + 1 new route)
  - Changed: 4 resources (3 routes updated to use new integration + 1 JWT authorizer)
- All 4 API endpoints operational through unified Lambda
- CloudWatch logs consolidated (single log group instead of 4)

### Architecture Notes

- Single Lambda benefits: Shared connection pool, shared token cache, simpler deployment, lower cost, less infrastructure complexity
- Router pattern uses regex matching for flexible path dispatching
- AI orchestrator is core application logic (not just another endpoint) - consolidation reflects this architecture
- Function calling working correctly: AI calls tools, validates data, handles edge cases naturally
- Gemini 2.5 Flash model stable and working (confirmed from user's API usage logs)

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
