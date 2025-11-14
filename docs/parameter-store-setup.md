# AWS Systems Manager Parameter Store Setup

This guide covers setup of application secrets in AWS Systems Manager Parameter Store for the Vehicle Wellness Center.

## Overview

**Why Parameter Store?**

- **FREE**: Standard tier parameters are completely free (vs $0.40/month for Secrets Manager)
- **Secure**: KMS encryption at rest, IAM permissions, CloudTrail audit logs
- **Simple**: Single JSON parameter contains all application secrets
- **Fast**: 50-100ms retrieval time (cached in Lambda memory)

## Prerequisites

- AWS CLI installed and configured
- AWS profile `terraform-vwc` with appropriate permissions
- Access to current secrets (MongoDB, Auth0, Gemini API keys)

## Initial Setup

### 1. Create Parameter Template

```powershell
# Copy the example template
cp infra/parameter-example.json temp-secrets.json
```

### 2. Populate Secrets

Edit `temp-secrets.json` with your actual values:

```json
{
  "MONGODB_ATLAS_HOST": "your-cluster.mongodb.net",
  "MONGODB_ATLAS_USERNAME": "your_db_user",
  "MONGODB_ATLAS_PASSWORD": "your_password",
  "AUTH0_DOMAIN": "your-tenant.us.auth0.com",
  "AUTH0_AUDIENCE": "https://vehiclewellnesscenter/api",
  "AUTH0_M2M_CLIENT_ID": "your_client_id",
  "AUTH0_M2M_CLIENT_SECRET": "your_client_secret",
  "GOOGLE_GEMINI_API_KEY": "your_gemini_key"
}
```

### 3. Create Parameter Store Parameter

```powershell
aws ssm put-parameter `
  --name /vwc/dev/secrets `
  --value (Get-Content temp-secrets.json -Raw) `
  --type SecureString `
  --region us-west-2 `
  --profile terraform-vwc
```

### 4. Secure Cleanup

```powershell
# Delete temporary file immediately
Remove-Item temp-secrets.json -Force
```

### 5. Verify Creation

```powershell
# Check parameter exists (value will show as encrypted)
aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --region us-west-2 `
  --profile terraform-vwc

# View decrypted value to verify (be careful - secrets visible!)
aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --with-decryption `
  --region us-west-2 `
  --profile terraform-vwc `
  --query 'Parameter.Value' `
  --output text
```

## Updating Secrets

### Update Single Field

```powershell
# 1. Get current value
aws ssm get-parameter --name /vwc/dev/secrets --with-decryption --query Parameter.Value --output text --region us-west-2 --profile terraform-vwc > temp.json

# 2. Edit temp.json with your changes

# 3. Update parameter
aws ssm put-parameter --name /vwc/dev/secrets --value (Get-Content temp.json -Raw) --type SecureString --overwrite --region us-west-2 --profile terraform-vwc

# 4. Clean up
Remove-Item temp.json -Force
```

### Replace All Secrets

Use the same process as initial setup with `--overwrite` flag.

## Migration from Secrets Manager

If migrating from AWS Secrets Manager:

### 1. Export Existing Secrets

```powershell
aws secretsmanager get-secret-value `
  --secret-id vehical-wellness-center-dev `
  --region us-west-2 `
  --profile terraform-vwc `
  --query SecretString `
  --output text > temp-secrets-full.json
```

### 2. Extract Required Fields

Create `temp-secrets.json` with only the fields needed by Lambda:

- `MONGODB_ATLAS_HOST`
- `MONGODB_ATLAS_USERNAME`
- `MONGODB_ATLAS_PASSWORD`
- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`
- `AUTH0_M2M_CLIENT_ID`
- `AUTH0_M2M_CLIENT_SECRET`
- `GOOGLE_GEMINI_API_KEY` (optional)

### 3. Upload to Parameter Store

Follow steps 3-5 from Initial Setup above.

### 4. Test Lambda

Verify Lambda functions work correctly with Parameter Store before removing Secrets Manager.

## Security Best Practices

- **Never commit** temp-secrets.json files to version control
- **Delete temporary files** immediately after use
- **Use IAM permissions** - restrict access to Parameter Store via IAM policies
- **Enable CloudTrail** - audit all parameter access
- **Rotate secrets** periodically (MongoDB passwords, Auth0 secrets, API keys)
- **Use KMS encryption** - Parameter Store SecureString uses AWS KMS automatically

## Troubleshooting

### Parameter Not Found

``` text
Error: Parameter /vwc/dev/secrets not found
```

**Solution**: Create the parameter using steps above.

### Access Denied

```text
Error: User is not authorized to perform: ssm:GetParameter
```

**Solution**: Update IAM policy for `terraform-vwc` user to include:

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:PutParameter"],
  "Resource": "arn:aws:ssm:us-west-2:*:parameter/vwc/*"
}
```

### Invalid JSON

```text
Error: Invalid JSON in parameter value
```

**Solution**: Validate JSON syntax in temp-secrets.json before uploading:

```powershell
Get-Content temp-secrets.json -Raw | ConvertFrom-Json
```

## Cost Comparison

| Service | Cost | Features |
|---------|------|----------|
| **Parameter Store (Standard)** | **$0.00/month** | KMS encryption, IAM, CloudTrail, 4KB limit |
| Secrets Manager | $0.40/month | Auto-rotation, version history, cross-region replication |

For our use case (simple credential storage without auto-rotation), Parameter Store Standard tier provides identical security at zero cost.

## See Also

- [AWS Systems Manager Parameter Store Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [SecureString Parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-securestring.html)
- [MongoDB Atlas Setup Guide](./MongoDB-Atlas-Setup-Guide.md)
- [Auth0 Setup Guide](./Auth0-Setup-Guide.md)
