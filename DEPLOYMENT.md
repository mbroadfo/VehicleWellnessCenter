# Deployment Guide

## Prerequisites

- AWS CLI configured with `terraform-vwc` profile
- Node.js 22+ and npm 10+
- Terraform installed
- All secrets configured in Parameter Store (`/vwc/dev/secrets`)

## Quick Deploy

### Deploy Everything (Backend + Frontend)

```bash
npm run deploy:all
```

This builds and deploys both Lambda backend and React frontend with CloudFront cache invalidation.

### Deploy Backend Only (Lambda)

```bash
npm run deploy:backend
```

Builds Lambda function and updates `vwc-dev` function code (fast, no Terraform).

### Deploy Frontend Only (React SPA)

```bash
npm run deploy:frontend
```

Builds React app, syncs to S3, and automatically invalidates CloudFront cache (~10-15 seconds).

## Infrastructure Management

### Apply Infrastructure Changes

```bash
# Plan changes
npm run infra:plan

# Apply changes
npm run infra:apply

# Destroy all infrastructure (DANGER!)
npm run infra:destroy
```

Use these when modifying Terraform configuration in `infra/main.tf`.

## Build Scripts

```bash
# Build both backend and frontend
npm run build

# Build backend only (Lambda zip)
npm run build:backend

# Build frontend only (dist/ folder)
npm run build:frontend
```

## Testing Before Deploy

```bash
# Type check all workspaces
npm run typecheck

# Lint all workspaces
npm run lint

# Run all tests
npm run test
```

## Deployment Outputs

After successful deployment:

- **Frontend URL**: <https://dgs070mgszb6.cloudfront.net>
- **API Gateway URL**: <https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com>
- **Lambda Function**: vwc-dev
- **S3 Bucket**: vwc-frontend-dev
- **CloudFront Distribution**: E36T027C39MTRV

## Common Workflows

### After Code Changes

```bash
# Backend changes
npm run deploy:backend

# Frontend changes
npm run deploy:frontend

# Both changed
npm run deploy:all
```

### After Infrastructure Changes

```bash
npm run infra:plan   # Review changes
npm run infra:apply  # Apply changes
```

### Full Clean Rebuild

```bash
npm run clean
npm install
npm run build
npm run deploy:all
```

## Auth0 Configuration

Frontend CloudFront URL must be added to Auth0 application:

1. Go to Auth0 Dashboard → Applications → Vehicle Wellness Center
2. **Allowed Callback URLs**: `https://dgs070mgszb6.cloudfront.net/callback`
3. **Allowed Logout URLs**: `https://dgs070mgszb6.cloudfront.net`
4. **Allowed Web Origins**: `https://dgs070mgszb6.cloudfront.net`

## Troubleshooting

### CloudFront shows old version

Run cache invalidation:

```bash
aws cloudfront create-invalidation \
  --distribution-id E36T027C39MTRV \
  --paths "/*" \
  --profile terraform-vwc
```

### Lambda deployment fails

Rebuild Lambda package:

```bash
npm run build:backend
npm run deploy:backend
```

### Terraform state issues

Re-import existing resources:

```bash
cd infra
terraform import aws_s3_bucket.frontend vwc-frontend-dev
terraform import aws_cloudfront_distribution.frontend E36T027C39MTRV
```

## Performance Notes

- **Backend deploy**: ~5 seconds (Lambda code update only)
- **Frontend deploy**: ~10 seconds (S3 sync + CloudFront invalidation)
- **Infrastructure apply**: ~3-5 minutes (CloudFront creation/updates are slow)
- **CloudFront invalidation**: Completes in 1-2 minutes

## Cost Optimization

- CloudFront invalidations: First 1,000/month free, then $0.005 each
- S3 PUT requests: $0.005 per 1,000 requests
- Lambda invocations: First 1M/month free
- API Gateway: First 1M/month free
