# Job Jar: Parameter Store Token Caching

## Overview

Implement AWS Systems Manager Parameter Store for shared Auth0 bearer token caching across all Lambda invocations. This eliminates the limitation of module-level caching (container-specific) and ensures tokens are reused across cold starts, reducing Auth0 API calls and improving performance.

## Current State

**Module-level caching (current implementation):**

- Token cached in Lambda container memory (`let cachedToken: CachedToken | null`)
- Cache lifetime: 15-45 minutes (Lambda container lifetime)
- Not shared across containers (each concurrent invocation gets own cache)
- Lost on cold starts
- Works for tests and low-traffic apps
- Zero cost

**Problem:**

- High concurrency = many containers = many Auth0 token requests
- Cold starts = cache miss = redundant token fetches
- Auth0 rate limit: 1,000 M2M tokens/month (free tier)

## Proposed Solution

**AWS Systems Manager Parameter Store:**

- Shared cache across ALL Lambda containers
- Survives cold starts
- Free (standard tier: 10,000 parameters, 40 TPS throughput)
- ~50-100ms latency (acceptable for token retrieval)
- Built-in versioning and IAM integration
- No infrastructure to manage (no buckets, tables, clusters)

## Implementation Plan

### 1. Create Parameter Store Resource (Terraform)

**File:** `infra/main.tf`

Add SSM parameter resource:

```hcl

# Auth0 token cache in Parameter Store
resource "aws_ssm_parameter" "auth0_token_cache" {
  name        = "/vwc/${var.environment}/auth0-token-cache"
  description = "Cached Auth0 M2M bearer token with expiration metadata"
  type        = "String"
  value       = "not-initialized" # Initial placeholder value
  tier        = "Standard"

  tags = {
    Project     = "VehicleWellnessCenter"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    ignore_changes = [value, description] # Managed by Lambda at runtime
  }
}
```

**Why ignore_changes?**

- Lambda will update token value and description (expiration timestamp)
- Terraform should not overwrite runtime-managed data
- Only infrastructure (name, type, tier) is Terraform-managed

### 2. Update Lambda IAM Policy (Terraform)

**File:** `infra/main.tf`

Add to Lambda execution role policy:

```hcl

# Add to existing Lambda role policy
statement {
  sid    = "ParameterStoreAccess"
  effect = "Allow"
  actions = [
    "ssm:GetParameter",
    "ssm:PutParameter"
  ]
  resources = [
    aws_ssm_parameter.auth0_token_cache.arn
  ]
}
```

**Permissions needed:**

- `ssm:GetParameter` - Read cached token
- `ssm:PutParameter` - Write new token and update expiration

### 3. Update terraform-vwc IAM Policy

**File:** `infra/terraform-vwc-core-policy-updated.json`

Add SSM permissions for Terraform user:

```json
{
  "Statement": [
    {
      "Sid": "ParameterStoreManagement",
      "Effect": "Allow",
      "Action": [
        "ssm:AddTagsToResource",
        "ssm:DeleteParameter",
        "ssm:DescribeParameters",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:ListTagsForResource",
        "ssm:PutParameter",
        "ssm:RemoveTagsFromResource"
      ],
      "Resource": "arn:aws:ssm:us-west-2:*:parameter/vwc/*"
    }
  ]
}
```

**Manual step required:**

```powershell

# Update AWS IAM policy
aws iam put-user-policy `
  --user-name terraform-vwc `
  --policy-name terraform-vwc-core `
  --policy-document (Get-Content infra/terraform-vwc-core-policy-updated.json -Raw) `
  --profile terraform-vwc
```

### 4. Install AWS SDK SSM Client (Backend)

**File:** `backend/package.json`

Add dependency:

```json
{
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.929.0",
    "@aws-sdk/client-ssm": "^3.929.0",
    "mongodb": "^7.0.0"
  }
}
```

Install:

```powershell
cd backend
npm install @aws-sdk/client-ssm
```

### 5. Implement Token Cache Service (Backend)

**File:** `backend/src/lib/auth0.ts`

Replace current implementation with Parameter Store caching:

```typescript
import { getSecrets } from './mongodb';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Module-level cache as first-tier (in-memory, fastest)
let memoryCache: CachedToken | null = null;

// Parameter Store as second-tier (shared, persistent)
const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-west-2'
});
const PARAMETER_NAME = '/vwc/dev/auth0-token-cache'; // TODO: Use environment variable

/**
 * Get cached token from Parameter Store
 * Returns null if not found or expired
 */
async function getTokenFromParameterStore(): Promise<CachedToken | null> {
  try {
    const command = new GetParameterCommand({
      Name: PARAMETER_NAME
    });
    const response = await ssmClient.send(command);
    
    if (!response.Parameter?.Value || !response.Parameter?.Description) {
      return null;
    }
    
    // Parse expiration from description (format: "expires:1234567890")
    const match = response.Parameter.Description.match(/expires:(\d+)/);
    if (!match) return null;
    
    const expiresAt = parseInt(match[1], 10);
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5-minute buffer
    
    // Check if token is still valid
    if (expiresAt <= now + bufferMs) {
      return null; // Expired or too close to expiration
    }
    
    return {
      token: response.Parameter.Value,
      expiresAt
    };
  } catch (error) {
    // Parameter not found or access denied - return null
    console.warn('Failed to get token from Parameter Store:', error);
    return null;
  }
}

/**
 * Save token to Parameter Store with expiration metadata
 */
async function saveTokenToParameterStore(token: string, expiresAt: number): Promise<void> {
  try {
    const command = new PutParameterCommand({
      Name: PARAMETER_NAME,
      Value: token,
      Type: 'String',
      Description: `expires:${expiresAt}`,
      Overwrite: true
    });
    await ssmClient.send(command);
  } catch (error) {
    // Log but don't fail - module-level cache still works
    console.error('Failed to save token to Parameter Store:', error);
  }
}

/**
 * Fetch new token from Auth0
 */
async function fetchNewToken(): Promise<CachedToken> {
  const secrets = await getSecrets();
  
  const domain: string = secrets.AUTH0_DOMAIN;
  const clientId: string = secrets.AUTH0_M2M_CLIENT_ID;
  const clientSecret: string = secrets.AUTH0_M2M_CLIENT_SECRET;
  const audience: string = secrets.AUTH0_AUDIENCE;
  
  const tokenUrl = `https://${domain}/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: audience,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get Auth0 token: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const data = (await response.json()) as Auth0TokenResponse;
  const now = Date.now();
  const expiresAt = now + (data.expires_in * 1000);
  
  return {
    token: data.access_token,
    expiresAt
  };
}

/**
 * Get an Auth0 access token using Client Credentials flow (M2M)
 * 
 * Uses two-tier caching:
 * 1. Memory cache (fastest, container-specific)
 * 2. Parameter Store (shared across all containers)
 * 
 * @returns Access token string
 * @throws Error if token retrieval fails
 */
export async function getAuth0Token(): Promise<string> {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5-minute buffer
  
  // Tier 1: Check memory cache (fastest)
  if (memoryCache && memoryCache.expiresAt > now + bufferMs) {
    return memoryCache.token;
  }
  
  // Tier 2: Check Parameter Store (shared across containers)
  const cachedToken = await getTokenFromParameterStore();
  if (cachedToken) {
    // Update memory cache for next invocation
    memoryCache = cachedToken;
    return cachedToken.token;
  }
  
  // Tier 3: Fetch new token from Auth0
  const newToken = await fetchNewToken();
  
  // Update both caches
  memoryCache = newToken;
  await saveTokenToParameterStore(newToken.token, newToken.expiresAt);
  
  return newToken.token;
}

/**
 * Clear both memory and Parameter Store caches (useful for testing)
 */
export async function clearAuth0TokenCache(): Promise<void> {
  memoryCache = null;
  try {
    await saveTokenToParameterStore('', 0); // Clear Parameter Store
  } catch {
    // Ignore errors during cache clear
  }
}
```

**Key features:**

- **Two-tier caching:** Memory (fast) + Parameter Store (shared)
- **Graceful degradation:** If Parameter Store fails, still works with memory cache
- **5-minute expiration buffer:** Ensures tokens are refreshed before expiration
- **Single Auth0 call:** Token shared across all Lambda containers
- **Error handling:** Logs but doesn't fail on Parameter Store errors

### 6. Update Environment Variables (Terraform)

**File:** `infra/main.tf`

Add parameter name to Lambda environment:

```hcl
resource "aws_lambda_function" "get_vehicle_overview" {
  # ... existing config ...
  
  environment {
    variables = {
      MONGODB_DATABASE          = "vehicle_wellness_center"
      AWS_SECRET_ID             = aws_secretsmanager_secret.vwc_secrets.id
      AUTH0_TOKEN_PARAMETER_NAME = aws_ssm_parameter.auth0_token_cache.name
    }
  }
}
```

Update code to use environment variable:

```typescript
const PARAMETER_NAME = process.env.AUTH0_TOKEN_PARAMETER_NAME || '/vwc/dev/auth0-token-cache';
```

## Testing Plan

### Unit Tests

Test token caching logic:

```typescript
// backend/src/lib/auth0.test.ts
describe('Auth0 Token Caching', () => {
  beforeEach(() => {
    clearAuth0TokenCache();
  });
  
  it('should fetch token on first call', async () => {
    const token = await getAuth0Token();
    expect(token).toBeTruthy();
  });
  
  it('should reuse cached token on second call', async () => {
    const token1 = await getAuth0Token();
    const token2 = await getAuth0Token();
    expect(token1).toBe(token2);
  });
  
  it('should clear cache when requested', async () => {
    await getAuth0Token();
    await clearAuth0TokenCache();
    // Next call should fetch new token
  });
});
```

### Integration Tests

Verify Parameter Store integration:

```powershell

# Deploy infrastructure
npm run infra:apply

# Run tests (should use Parameter Store)
npm run test

# Check Parameter Store (should contain token)
aws ssm get-parameter --name /vwc/dev/auth0-token-cache --region us-west-2 --profile terraform-vwc

# Verify token is valid
$param = aws ssm get-parameter --name /vwc/dev/auth0-token-cache --query 'Parameter.Value' --output text --region us-west-2 --profile terraform-vwc
Invoke-RestMethod -Uri "https://YOUR_API_URL/vehicles/test/overview" -Headers @{ Authorization = "Bearer $param" }
```

### Performance Tests

Measure latency impact:

```typescript
// Measure token retrieval time
const start = Date.now();
const token = await getAuth0Token();
const duration = Date.now() - start;
console.log(`Token retrieval: ${duration}ms`);

// Expected results:
// - Memory cache hit: 0-1ms
// - Parameter Store hit: 50-100ms
// - Auth0 fetch: 500-1000ms
```

## Deployment Steps

1. **Update IAM policy for terraform-vwc user** (manual step)
2. **Install SSM client:** `cd backend && npm install @aws-sdk/client-ssm`
3. **Update auth0.ts** with Parameter Store implementation
4. **Update Terraform:** Add SSM parameter resource and Lambda permissions
5. **Deploy infrastructure:** `npm run infra:apply`
6. **Run tests:** `npm run test` (should pass with no changes to test code)
7. **Verify Parameter Store:** Check token is cached in AWS console
8. **Monitor logs:** Ensure no permission errors in CloudWatch

## Rollback Plan

If Parameter Store implementation has issues:

1. Revert `backend/src/lib/auth0.ts` to module-level caching
2. Keep Terraform resources (no harm, just unused)
3. Module-level cache continues to work as fallback

## Cost Analysis

**Current (module-level cache):**

- Cost: $0
- Token requests: ~100-1000/month (depends on cold starts)

**With Parameter Store:**

- SSM Parameter: $0 (standard tier free)
- SSM API calls: $0 (40 TPS free tier, we use <<1 TPS)
- Token requests to Auth0: ~30/month (1 per day)
- Total cost: $0

**Savings:**

- Reduced Auth0 API calls: 70-970/month fewer requests
- Better rate limit headroom for production scaling
- Improved Lambda cold start performance (reuse cached token)

## Security Considerations

**Token security:**

- Tokens stored as standard parameters (not SecureString)
- Tokens are JWTs (already encrypted/signed by Auth0)
- IAM policies restrict access to Lambda execution role only
- Tokens expire in 24 hours (short-lived)
- No sensitive data in token payload (M2M tokens contain only client_id, aud, iss)

**IAM permissions:**

- Lambda: Read/write access to specific parameter only
- Terraform: Full parameter management under `/vwc/*` namespace
- No public access (private parameters)

**Audit trail:**

- Parameter version history tracks token updates
- CloudWatch logs show token fetch/cache events
- CloudTrail logs Parameter Store API calls

## Benefits Summary

✅ **Shared cache** - All Lambda containers use same token
✅ **Survives cold starts** - Token persists across container lifecycle
✅ **100% free** - Standard tier Parameter Store
✅ **Reduced latency** - Fewer Auth0 API calls (500-1000ms → 50-100ms)
✅ **Rate limit protection** - 30x reduction in Auth0 token requests
✅ **Graceful degradation** - Falls back to memory cache if Parameter Store fails
✅ **Easy to implement** - ~200 lines of code, 20 lines of Terraform
✅ **Production-ready** - Scales to high concurrency with no changes

## Future Enhancements

- **CloudWatch metrics:** Track cache hit/miss rates
- **Automatic token refresh:** Background Lambda to proactively refresh before expiration
- **Multi-region:** Replicate parameter across regions (if needed)
- **Token rotation:** Support multiple M2M clients for zero-downtime rotation

## References

- [AWS Systems Manager Parameter Store Pricing](https://aws.amazon.com/systems-manager/pricing/)
- [Parameter Store Best Practices](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-best-practices.html)
- [Auth0 Rate Limits](https://auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy)

## Status

- **Priority:** Medium (optimization, not critical)
- **Complexity:** Low-Medium (2-3 hours implementation + testing)
- **Risk:** Low (graceful degradation to current solution)
- **Dependencies:** None (can implement anytime)
- **Milestone:** Post-MVP (after core CRUD operations complete)
