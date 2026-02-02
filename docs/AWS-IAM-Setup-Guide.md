# AWS IAM Setup Guide

Complete guide for setting up AWS IAM users, permissions, and API credentials for the Vehicle Wellness Center project.

## Overview

This project requires two IAM users with different permission scopes:

1. **terraform-vwc** - Infrastructure provisioning (Terraform operations)
2. **vwc-api** - Application runtime (Lambda execution)

## Prerequisites

- AWS account with admin access
- AWS CLI installed and configured
- Understanding of IAM policies and permissions

## Part 1: Create IAM Users

### 1.1 Create Terraform User

**Purpose**: Provisions and manages AWS infrastructure via Terraform.

**Steps**:

1. Sign in to AWS Console → IAM → Users → "Create user"
2. User name: `terraform-vwc`
3. Select: "Programmatic access" (no console access needed)
4. Permissions: Skip for now (we'll attach custom policy)
5. Review and create

### 1.2 Create API User

**Purpose**: Lambda functions use this for runtime operations (MongoDB access, Parameter Store).

**Steps**:

1. IAM → Users → "Create user"
2. User name: `vwc-api`
3. Select: "Programmatic access"
4. Permissions: Skip for now
5. Review and create

## Part 2: Configure IAM Policies

### 2.1 Terraform User Policy

**Policy Name**: `terraform-vwc-core`

This policy grants permissions for Terraform to manage:

- Lambda functions
- API Gateway
- CloudWatch Logs
- Parameter Store
- IAM roles (scoped to `vwc-*` resources)

**Apply the Policy**:

1. IAM → Policies → "Create policy"
2. Select "JSON" tab
3. Copy contents from `infra/terraform-vwc-core-policy-updated.json`
4. Name: `terraform-vwc-core`
5. Create policy
6. IAM → Users → `terraform-vwc` → "Add permissions" → "Attach policies directly"
7. Search for `terraform-vwc-core` and attach

**Reference File**: `infra/terraform-vwc-core-policy-updated.json`

**Key Permissions**:

- ✅ Lambda: Create/update/delete functions
- ✅ API Gateway: Full management
- ✅ CloudWatch Logs: Create log groups, set retention
- ✅ Parameter Store: Read/write `/vwc/*` parameters
- ✅ IAM: Manage roles with `vwc-*` prefix only
- ❌ No S3, DynamoDB, or other services (not needed yet)

### 2.2 API User Policy

**Policy Name**: `vwc-api-runtime`

This is managed by Terraform and attached to the Lambda execution role. You don't need to create this manually - Terraform will create it.

**What Terraform Creates**:

- IAM role: `vwc-lambda-execution-role`
- Permissions:
  - Read Parameter Store: `/vwc/dev/secrets`
  - Read/write token cache: `/vwc/dev/auth0-token-cache`
  - Write CloudWatch Logs

**Verify After Terraform Apply**:

```bash

# Check that Terraform created the role
aws iam get-role --role-name vwc-lambda-execution-role --profile terraform-vwc
```

## Part 3: Generate Access Keys

### 3.1 Terraform User Access Keys

**Steps**:

1. IAM → Users → `terraform-vwc` → "Security credentials" tab
2. "Create access key"
3. Use case: "Command Line Interface (CLI)"
4. Set description tag: "Local development - Terraform operations"
5. Copy **Access Key ID** and **Secret Access Key**

⚠️ **Security**: Save these immediately - you can't view the secret again!

### 3.2 API User Access Keys

**Steps**:

1. IAM → Users → `vwc-api` → "Security credentials" tab
2. "Create access key"
3. Use case: "Application running outside AWS"
4. Set description tag: "Lambda runtime - MongoDB and Parameter Store access"
5. Copy **Access Key ID** and **Secret Access Key**

## Part 4: Configure Local Credentials

### 4.1 Create Local Credentials File

Copy the template:

```powershell
Copy-Item -Path ".aws-credentials.example" -Destination ".aws-credentials"
```

### 4.2 Edit `.aws-credentials`

Fill in the values you just created:

```bash

# VWC API User (for Lambda runtime)
VWC_API_ACCESS_KEY_ID=AKIA...         # From vwc-api user
VWC_API_SECRET_ACCESS_KEY=...         # From vwc-api user

# Terraform VWC User (for infrastructure provisioning)
TERRAFORM_VWC_ACCESS_KEY_ID=AKIA...   # From terraform-vwc user
TERRAFORM_VWC_SECRET_ACCESS_KEY=...   # From terraform-vwc user

# AWS Region
AWS_REGION=us-west-2

# Parameter Store path for application secrets
SSM_SECRETS_PARAMETER_NAME=/vwc/dev/secrets
```

**⚠️ Never commit this file!** It's in `.gitignore`.

### 4.3 Configure AWS CLI Profiles

Add profiles to `~/.aws/credentials`:

```ini
[terraform-vwc]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
region = us-west-2

[vwc-api]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
region = us-west-2
```

### 4.4 Test Credentials

```powershell

# Test Terraform user
aws sts get-caller-identity --profile terraform-vwc

# Should show:
# UserId: AIDA...
# Account: 491696534851
# Arn: arn:aws:iam::491696534851:user/terraform-vwc

# Test API user
aws sts get-caller-identity --profile vwc-api

# Should show:
# Arn: arn:aws:iam::491696534851:user/vwc-api
```

## Part 5: MongoDB Atlas API Keys

### 5.1 Generate Atlas Programmatic API Keys

**Purpose**: Terraform needs these to provision Atlas clusters.

**Steps**:

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Organization menu (top-left) → "Organization Access Manager"
3. "Create API Key" (top-right)
4. Description: "Terraform - Vehicle Wellness Center Infrastructure"
5. Permissions: "Organization Project Creator" (or "Organization Owner" if you need full control)
6. Copy **Public Key** and **Private Key**

⚠️ **Security**: Save the private key immediately - you can't view it again!

### 5.2 Get Atlas Organization and Project IDs

**Organization ID**:

1. Atlas → Organization Settings → Organization ID
2. Copy the ID (format: `5d5c09149ccf64c5d84a9f0d`)

**Project ID**:

1. Atlas → Select your project → Settings → Project ID
2. Copy the ID (format: `69137eb1b0d4e75e6425205d`)

Or create a new project:

1. Atlas → "New Project"
2. Name: "Vehicle Wellness Center"
3. Copy the Project ID after creation

## Part 6: Auth0 Configuration

### 6.1 Create Auth0 Tenant

See `docs/Auth0-Setup-Guide.md` for complete instructions.

**Quick Steps**:

1. Sign up at [Auth0](https://auth0.com)
2. Create tenant: `vwc-dev` (or your preferred name)
3. Note your domain: `vwc-dev.us.auth0.com`

### 6.2 Create Auth0 API

1. Auth0 Dashboard → Applications → APIs → "Create API"
2. Name: "Vehicle Wellness Center API"
3. Identifier: `https://vehiclewellnesscenter/api`
4. Signing algorithm: RS256
5. Copy the **Audience** (API identifier)

### 6.3 Create M2M Application

**Purpose**: Allows backend to generate tokens for testing.

1. Auth0 Dashboard → Applications → Applications → "Create Application"
2. Name: "VWC Backend M2M"
3. Type: "Machine to Machine Application"
4. Authorize for your API
5. Permissions: Grant all scopes
6. Copy **Client ID** and **Client Secret** from Settings tab

## Part 7: Google Gemini API Key

### 7.1 Get Gemini API Key

**Purpose**: AI chat functionality.

**Steps**:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Click "Create API Key"
4. Select project or create new one
5. Copy the API key

**Free Tier**: 15 requests/minute, 1500 requests/day

## Part 8: Store Secrets in Parameter Store

### 8.1 Create Parameter Store Secret

All application secrets go into a single SecureString parameter.

**Create the parameter**:

```powershell

# Create JSON with all secrets
$secrets = @{
    MONGODB_ATLAS_HOST = "vehicalwellnesscenter-c.shpig7c.mongodb.net"
    MONGODB_ATLAS_USERNAME = "vwc_admin_db_user"
    MONGODB_ATLAS_PASSWORD = "YOUR_MONGODB_PASSWORD"
    MONGODB_ATLAS_PUBLIC_KEY = "YOUR_ATLAS_PUBLIC_KEY"
    MONGODB_ATLAS_PRIVATE_KEY = "YOUR_ATLAS_PRIVATE_KEY"
    MONGODB_ATLAS_ORG_ID = "5d5c09149ccf64c5d84a9f0d"
    MONGODB_ATLAS_PROJECT_ID = "69137eb1b0d4e75e6425205d"
    AUTH0_DOMAIN = "vwc-dev.us.auth0.com"
    AUTH0_AUDIENCE = "https://vehiclewellnesscenter/api"
    AUTH0_M2M_CLIENT_ID = "YOUR_M2M_CLIENT_ID"
    AUTH0_M2M_CLIENT_SECRET = "YOUR_M2M_CLIENT_SECRET"
    GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"
} | ConvertTo-Json -Compress

# Put parameter
aws ssm put-parameter `
  --name /vwc/dev/secrets `
  --value $secrets `
  --type SecureString `
  --description "VWC application secrets (MongoDB, Auth0, Gemini)" `
  --tags "Key=Project,Value=VehicleWellnessCenter" "Key=Environment,Value=dev" `
  --profile terraform-vwc `
  --region us-west-2
```

**Verify**:

```powershell

# Read back (decrypted)
aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --with-decryption `
  --profile terraform-vwc `
  --region us-west-2 `
  --query Parameter.Value `
  --output text | ConvertFrom-Json
```

### 8.2 Verify Terraform Can Access Secrets

```powershell

# Load environment and test
node infra/load-tf-env.js

# Should output:
# ✅ AWS environment configured for Terraform!
# ✅ Terraform variables loaded from Parameter Store!
# MongoDB Atlas Org ID: 5d5c09149ccf64c5d84a9f0d
# MongoDB Atlas Project ID: 69137eb1b0d4e75e6425205d
```

## Part 9: Run Terraform

### 9.1 Initialize Terraform

```powershell
npm run infra:init
```

### 9.2 Plan Infrastructure

```powershell
npm run infra:plan
```

Review the plan - should show ~20 resources to create.

### 9.3 Apply Infrastructure

```powershell
npm run infra:apply
```

This creates:

- MongoDB Atlas M0 cluster
- Lambda function
- API Gateway with JWT authorizer
- CloudWatch log groups
- Parameter Store token cache

### 9.4 Verify Deployment

```powershell

# Run tests
npm test

# Should show: 35/35 tests passing
```

## Security Checklist

- [ ] `.aws-credentials` file created and in `.gitignore`
- [ ] AWS access keys stored securely (password manager)
- [ ] MongoDB Atlas password is strong (20+ characters)
- [ ] Auth0 M2M client secret stored in Parameter Store only
- [ ] Gemini API key stored in Parameter Store only
- [ ] Never commit secrets to Git
- [ ] IAM users have minimum required permissions
- [ ] Atlas API keys have organization-level scope only
- [ ] All secrets encrypted at rest (Parameter Store SecureString with KMS)

## Troubleshooting

### "AccessDenied" when running Terraform

- Verify `terraform-vwc` user has `terraform-vwc-core` policy attached
- Check AWS_PROFILE is set correctly: `echo $env:AWS_PROFILE`
- Verify credentials: `aws sts get-caller-identity --profile terraform-vwc`

### "ParameterNotFound" errors

- Ensure Parameter Store secret exists: `aws ssm get-parameter --name /vwc/dev/secrets --profile terraform-vwc`
- Verify all required fields in JSON (12 keys total)

### Lambda can't connect to MongoDB

- Check MongoDB Atlas IP whitelist includes `0.0.0.0/0` (or Lambda NAT gateway IP)
- Verify MongoDB user exists in Atlas UI
- Test connection: `npm run backend:test-connection`

### Auth0 token errors

- Verify M2M application is authorized for your API
- Check client ID and secret in Parameter Store match Auth0
- Ensure API audience matches exactly

## Reference Files

- **IAM Policy Template**: `infra/terraform-vwc-core-policy-updated.json`
- **Credentials Template**: `.aws-credentials.example`
- **Auth0 Setup**: `docs/Auth0-Setup-Guide.md`
- **MongoDB Setup**: `docs/MongoDB-Atlas-Setup-Guide.md`
- **Parameter Store Setup**: `docs/parameter-store-setup.md`

## Cost Summary

- **IAM Users**: FREE
- **Parameter Store**: FREE (Standard tier, <10k parameters)
- **MongoDB Atlas**: FREE (M0 cluster)
- **Lambda**: FREE tier (1M requests/month)
- **API Gateway**: FREE tier (1M requests/month)
- **Auth0**: FREE tier (7k active users)
- **Gemini API**: FREE tier (1500 requests/day)

**Total Monthly Cost**: $0.00 (assuming free tier limits)
