# Auth0 Setup for Vehicle Wellness Center

## Overview

VWC uses Auth0 for JWT authentication. You need to create:

1. Auth0 Tenant (free tier available)
2. Auth0 API for VWC
3. Auth0 Application for testing/frontend

## Step 1: Create Auth0 Tenant

1. Go to <https://auth0.com/> and sign up (free tier)
2. Create a new tenant: `vwc-YOUR-NAME` (e.g., `vwc-dev`)
3. Choose region closest to your AWS region (us-west-2 → US)
4. Note your tenant domain: `vwc-YOUR-NAME.auth0.com`

## Step 2: Create Auth0 API

1. In Auth0 Dashboard → Applications → APIs
2. Click "Create API"
3. **Name**: Vehicle Wellness Center API
4. **Identifier**: `vwc-api` (or `https://api.vehiclewellnesscenter.com`)
   - This is your `auth0_audience` variable
   - Must match exactly in Terraform and API requests
5. **Signing Algorithm**: RS256 (default)
6. Click "Create"

**Important Settings:**

- Enable RBAC (Role-Based Access Control) if you need permissions
- Set Token Expiration as needed (default: 86400 seconds / 24 hours)

## Step 3a: Create M2M Application (for automated testing & admin)

1. In Auth0 Dashboard → Applications → Applications
2. Click "Create Application"
3. **Name**: Vehicle Wellness Center M2M
4. **Type**: Machine to Machine Applications
5. Select the API: **Vehicle Wellness Center API**
6. Click "Authorize"
7. Select permissions if needed (none required for basic CRUD)
8. Click "Authorize"

**Note your M2M credentials:**

- Client ID: Save to AWS Secrets Manager as `AUTH0_M2M_CLIENT_ID`
- Client Secret: Save to AWS Secrets Manager as `AUTH0_M2M_CLIENT_SECRET`

**Verify Settings:**

- Application Type: Machine to Machine
- Grant Types: Client Credentials (should be auto-enabled)
- APIs tab: Vehicle Wellness Center API should be listed as authorized

## Step 3b: Create SPA Application (for React frontend)

1. In Auth0 Dashboard → Applications → Applications
2. Click "Create Application"
3. **Name**: VWC Test Client
4. **Type**: Single Page Application
5. Click "Create"

**Configure Settings:**

- **Allowed Callback URLs**: `http://localhost:5173` (Vite dev server)
- **Allowed Logout URLs**: `http://localhost:5173`
- **Allowed Web Origins**: `http://localhost:5173`
- **Allowed Origins (CORS)**: `http://localhost:5173`

**Note your credentials:**

- Domain: `vwc-YOUR-NAME.auth0.com`
- Client ID: `abc123...` (needed for frontend)

## Step 4: Update Terraform Variables

Add to `infra/terraform.tfvars`:

```hcl
auth0_domain   = "vwc-YOUR-NAME.auth0.com"
auth0_audience = "vwc-api"  # Must match API identifier from Step 2
```

## Step 5: Deploy Infrastructure

```powershell
npm run infra:apply
```

This will:

- Create JWT authorizer with Auth0 issuer
- Protect all API routes with JWT validation
- Validate tokens using Auth0's public keys (JWKS)

## Step 6: Get Test Token

### Option A: Auth0 Dashboard (Quick Test)

1. Go to APIs → Vehicle Wellness Center API → Test tab
2. Copy the test token
3. Use immediately (expires in 24 hours)

### Option B: API Explorer

1. Go to Applications → APIs Explorer Application
2. Click "Test" tab
3. Get token for your API

### Option C: curl (programmatic)

```bash
curl --request POST \
  --url https://vwc-YOUR-NAME.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{
    "client_id":"YOUR_CLIENT_ID",
    "client_secret":"YOUR_CLIENT_SECRET",
    "audience":"vwc-api",
    "grant_type":"client_credentials"
  }'
```

### Option D: PowerShell

```powershell
$body = @{
    client_id     = "YOUR_CLIENT_ID"
    client_secret = "YOUR_CLIENT_SECRET"
    audience      = "vwc-api"
    grant_type    = "client_credentials"
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "https://vwc-YOUR-NAME.auth0.com/oauth/token" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

$token = $response.access_token
Write-Host "Token: $token"
```

## Step 7: Test API with Token

```powershell
$token = "YOUR_AUTH0_TOKEN"
$headers = @{ Authorization = "Bearer $token" }

Invoke-RestMethod `
  -Uri "https://YOUR_API_URL/vehicles/{vehicleId}/overview" `
  -Headers $headers
```

**Expected Results:**

- ✅ With valid token: 200 OK or 404 Not Found (vehicle doesn't exist)
- ❌ Without token: 401 Unauthorized
- ❌ With invalid token: 401 Unauthorized
- ❌ With expired token: 401 Unauthorized

## Architecture

```text
Frontend (React)
    ↓ Login via Auth0
Auth0 (Identity Provider)
    ↓ Returns JWT (RS256)
Frontend stores token
    ↓ API requests with Authorization: Bearer <token>
API Gateway
    ↓ Validates JWT with Auth0 JWKS
    ✓ Valid → Forward to Lambda
    ✗ Invalid → 401 Unauthorized
Lambda Functions
```

**Key Points:**

- API Gateway fetches Auth0's public keys automatically (JWKS endpoint)
- No secrets needed in AWS - validation uses public key cryptography
- Tokens are signed by Auth0's private key (secure)
- API Gateway validates with Auth0's public key (published at `https://YOUR-DOMAIN.auth0.com/.well-known/jwks.json`)

## Troubleshooting

### Error: "Unauthorized" with valid-looking token

1. **Check issuer**: Must match exactly with trailing slash
   - Terraform: `https://vwc-YOUR-NAME.auth0.com/`
   - Token `iss` claim: `https://vwc-YOUR-NAME.auth0.com/`

2. **Check audience**: Must match exactly
   - Terraform: `vwc-api`
   - Token `aud` claim: `["vwc-api"]`

3. **Decode token**: Use <https://jwt.io> to inspect claims
   - Verify `iss`, `aud`, `exp` (expiration)
   - Check if token expired

4. **Check Authorization header format**: `Bearer <token>` (with space)

### Auth0 API not receiving requests

- Verify `audience` parameter when getting token
- Check Client ID/Secret are correct
- Ensure grant type is `client_credentials`

### Terraform apply fails

- Verify `auth0_domain` and `auth0_audience` variables are set
- Check variables match Auth0 configuration exactly

## Next Steps

- [ ] Create Auth0 tenant
- [ ] Create Auth0 API with identifier
- [ ] Create Auth0 test application
- [ ] Update terraform.tfvars with Auth0 config
- [ ] Deploy infrastructure with JWT authorizer
- [ ] Get test token from Auth0
- [ ] Test protected API endpoints
- [ ] Integrate Auth0 SDK in React frontend (Milestone 5)

## Production Considerations

- Use different tenants for dev/staging/prod
- Set appropriate token expiration times
- Enable MFA for user logins
- Configure custom domains for branded auth experience
- Set up proper callback URLs for production domain
- Monitor Auth0 rate limits (free tier: 7,000 active users, 1,000 M2M tokens/month)
- Consider paid plan for production features (SLA, advanced security, custom domains)
