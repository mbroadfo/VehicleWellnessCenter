# Infrastructure

This directory contains Terraform configuration for the Vehicle Wellness Center platform. Modules will provision MongoDB Atlas resources, AWS Lambda functions, API Gateway, S3 hosting (including asset and image storage), and supporting services such as Secrets Manager.

## Usage

All infrastructure commands should be run from the project root using npm scripts:

```powershell
npm run infra:init    # Initialize Terraform (first time only)
npm run infra:plan    # Preview infrastructure changes
npm run infra:apply   # Apply infrastructure changes
npm run infra:destroy # Tear down all infrastructure
```

These commands automatically:

- Load AWS credentials (profile: `terraform-vwc`, region: `us-west-2`)
- Fetch Terraform variables from AWS Secrets Manager
- Format Terraform files with `terraform fmt` (before plan/apply)
- Execute in the `infra/` directory

## Notes

- MongoDB Atlas application credentials are read at deploy time from AWS Secrets Manager; provide the secret ARN/ID via `TF_VAR_mongodb_database_user_secret_id` (or workspace variable) to avoid committing secrets.
- `collection-samples.json` mirrors the collection validators and indexes used by Terraform so you can review or iterate before applying changes.
- Terraform renders `collections-init.js` from `collections-init.js.tftpl`, allowing you to initialize collections manually with `mongosh` if needed.
- `load-tf-env.js` is the credential loading script used by all `infra:*` commands - no manual environment setup needed.
