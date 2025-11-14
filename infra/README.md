# Infrastructure

This directory contains Terraform configuration for the Vehicle Wellness Center platform. Modules will provision MongoDB Atlas resources, AWS Lambda functions, API Gateway, S3 hosting (including asset and image storage), and supporting services such as Systems Manager Parameter Store.

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
- Fetch Terraform variables from legacy AWS Secrets Manager secret
- Format Terraform files with `terraform fmt` (before plan/apply)
- Execute in the `infra/` directory

## Authentication

API Gateway uses Auth0 JWT authentication (RS256) to secure all endpoints. Required configuration in AWS Systems Manager Parameter Store parameter `/vwc/dev/secrets`:

- `AUTH0_DOMAIN` - Your Auth0 tenant domain (e.g., `vwc-dev.auth0.com`)
- `AUTH0_AUDIENCE` - Your API audience identifier (e.g., `https://vehiclewellnesscenter/api`)
- `AUTH0_M2M_CLIENT_ID` - M2M application client ID for token generation
- `AUTH0_M2M_CLIENT_SECRET` - M2M application client secret

See `docs/Auth0-Setup-Guide.md` for complete setup instructions.

## Secrets Management

Application secrets (MongoDB, Auth0, Gemini) are stored in AWS Systems Manager Parameter Store:

- **Parameter**: `/vwc/dev/secrets` (SecureString with KMS encryption)
- **Cost**: FREE (Standard tier)
- **Setup**: See `docs/parameter-store-setup.md` for provisioning instructions

Note: Terraform variables are still read from legacy Secrets Manager secret `vehical-wellness-center-dev` for Atlas API keys and project IDs.

## Notes

- `collection-samples.json` mirrors the collection validators and indexes used by Terraform so you can review or iterate before applying changes.
- Terraform renders `collections-init.js` from `collections-init.js.tftpl`, allowing you to initialize collections manually with `mongosh` if needed.
- `load-tf-env.js` is the credential loading script used by all `infra:*` commands - no manual environment setup needed.
