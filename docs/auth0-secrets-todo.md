# VWC Auth0 Secret Update Instructions

You need to add two Auth0 fields to your AWS Secrets Manager secret: `vehical-wellness-center-dev`

## Quick Steps

1. **Create Auth0 tenant and API** (if you haven't already)
   - See `docs/Auth0-Setup-Guide.md` for full instructions
   - You'll get: domain and audience

2. **Update AWS Secret**

```powershell
# Get current secret
aws secretsmanager get-secret-value `
  --secret-id vehical-wellness-center-dev `
  --region us-west-2 `
  --profile terraform-vwc `
  --query SecretString `
  --output text | Out-File -Encoding utf8 temp-secret.json

# Edit temp-secret.json and add:
# "AUTH0_DOMAIN": "vwc-YOUR-TENANT.auth0.com",
# "AUTH0_AUDIENCE": "vwc-api",

# Update secret
aws secretsmanager update-secret `
  --secret-id vehical-wellness-center-dev `
  --secret-string (Get-Content temp-secret.json -Raw) `
  --region us-west-2 `
  --profile terraform-vwc

# Clean up
Remove-Item temp-secret.json
```

3. **Deploy infrastructure**

```powershell
npm run infra:apply
```

## What to Add

Add these two fields to your existing secret JSON:

```json
{
  "MONGODB_ATLAS_PUBLIC_KEY": "...",
  "MONGODB_ATLAS_PRIVATE_KEY": "...",
  "AUTH0_DOMAIN": "vwc-YOUR-TENANT.auth0.com",
  "AUTH0_AUDIENCE": "vwc-api"
}
```

**Important:**
- `AUTH0_DOMAIN`: Just the domain, no `https://` or trailing slash
  - ✅ Correct: `vwc-dev.auth0.com`
  - ❌ Wrong: `https://vwc-dev.auth0.com/`
- `AUTH0_AUDIENCE`: Must match exactly what you set in Auth0 API configuration
  - Example: `vwc-api` or `https://api.vehiclewellnesscenter.com`

