# Adding Atlas API Keys to Parameter Store

**Goal**: Move the MongoDB Atlas API keys from the old secret to Parameter Store so we can delete the old secret entirely.

## Current State

The `/vwc/dev/secrets` Parameter Store parameter currently contains:

```json
{
  "MONGODB_ATLAS_HOST": "...",
  "MONGODB_ATLAS_USERNAME": "...",
  "MONGODB_ATLAS_PASSWORD": "...",
  "AUTH0_DOMAIN": "...",
  "AUTH0_AUDIENCE": "...",
  "AUTH0_M2M_CLIENT_ID": "...",
  "AUTH0_M2M_CLIENT_SECRET": "...",
  "GEMINI_API_KEY": "..."
}
```

## What Needs to Be Added

The `infra/load-tf-env.js` script currently reads these additional values from the old secret:

- `MONGODB_ATLAS_PUBLIC_KEY` - Atlas API public key for Terraform provider
- `MONGODB_ATLAS_PRIVATE_KEY` - Atlas API private key for Terraform provider
- `MONGODB_ATLAS_ORG_ID` - Atlas organization ID
- `MONGODB_ATLAS_PROJECT_ID` - Atlas project ID

## Migration Steps

### 1. Export Current Values from Old Secret

```powershell

# Get the old secret values
aws secretsmanager get-secret-value `
  --secret-id vehical-wellness-center-dev `
  --profile terraform-vwc `
  --region us-west-2 `
  --query SecretString `
  --output text | ConvertFrom-Json
```

Copy the values for:

- `MONGODB_ATLAS_PUBLIC_KEY`
- `MONGODB_ATLAS_PRIVATE_KEY`
- `MONGODB_ATLAS_ORG_ID`
- `MONGODB_ATLAS_PROJECT_ID`

### 2. Get Current Parameter Store Value

```powershell

# Get current parameter
aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --with-decryption `
  --profile terraform-vwc `
  --region us-west-2 `
  --query Parameter.Value `
  --output text | ConvertFrom-Json
```

### 3. Merge and Update Parameter Store

Create a complete JSON with all values:

```json
{
  "MONGODB_ATLAS_HOST": "...",
  "MONGODB_ATLAS_USERNAME": "...",
  "MONGODB_ATLAS_PASSWORD": "...",
  "MONGODB_ATLAS_PUBLIC_KEY": "...",
  "MONGODB_ATLAS_PRIVATE_KEY": "...",
  "MONGODB_ATLAS_ORG_ID": "...",
  "MONGODB_ATLAS_PROJECT_ID": "...",
  "AUTH0_DOMAIN": "...",
  "AUTH0_AUDIENCE": "...",
  "AUTH0_M2M_CLIENT_ID": "...",
  "AUTH0_M2M_CLIENT_SECRET": "...",
  "GEMINI_API_KEY": "..."
}
```

Update the parameter:

```powershell

# Update parameter with merged values
aws ssm put-parameter `
  --name /vwc/dev/secrets `
  --value '{"MONGODB_ATLAS_HOST":"...","MONGODB_ATLAS_USERNAME":"...","MONGODB_ATLAS_PASSWORD":"...","MONGODB_ATLAS_PUBLIC_KEY":"...","MONGODB_ATLAS_PRIVATE_KEY":"...","MONGODB_ATLAS_ORG_ID":"...","MONGODB_ATLAS_PROJECT_ID":"...","AUTH0_DOMAIN":"...","AUTH0_AUDIENCE":"...","AUTH0_M2M_CLIENT_ID":"...","AUTH0_M2M_CLIENT_SECRET":"...","GEMINI_API_KEY":"..."}' `
  --type SecureString `
  --overwrite `
  --profile terraform-vwc `
  --region us-west-2
```

### 4. Test Terraform Script

```powershell

# Test that load-tf-env.js can read all values
node infra/load-tf-env.js
```

You should see:

```text
✅ AWS environment configured for Terraform!
Profile: terraform-vwc
Region: us-west-2
Parameter: /vwc/dev/secrets

✅ Terraform variables loaded from Parameter Store!
MongoDB Atlas Org ID: ...
MongoDB Atlas Project ID: ...
```

### 5. Test Terraform Plan

```powershell

# Verify Terraform can still access Atlas
npm run infra:plan
```

Should complete without errors about missing Atlas credentials.

### 6. Delete Old Secret

Once verified, delete the old secret:

```powershell
aws secretsmanager delete-secret `
  --secret-id vehical-wellness-center-dev `
  --recovery-window-in-days 7 `
  --profile terraform-vwc `
  --region us-west-2
```

## Verification Checklist

- [ ] Atlas API keys exported from old secret
- [ ] Parameter Store updated with all values (12 total keys)
- [ ] `node infra/load-tf-env.js` succeeds
- [ ] `npm run infra:plan` succeeds
- [ ] All tests pass: `npm test` (35/35)
- [ ] Old secret deleted with 7-day recovery window

## Cost Savings

- Before: $0.40/month for old secret = $4.80/year
- After: $0.00 (Parameter Store Standard tier is FREE)
- **Annual Savings: $4.80**
