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
