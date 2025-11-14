# Migration Plan: Secrets Manager → Parameter Store

**Goal**: Replace AWS Secrets Manager with Parameter Store to eliminate costs while maintaining security and functionality.

**Cost Savings**: Secrets Manager costs $0.40/secret/month ($4.80/year). Parameter Store Standard tier is **free**.

**Current State**:

- Secret: `vehical-wellness-center-dev` contains 7 fields (MongoDB credentials, Auth0 config, Gemini API key))
- Used by: Lambda functions, Terraform, integration tests, utility scripts
- Dependencies: 15+ code references, 8+ documentation files

**Success Model**: Parameter Store token cache implementation demonstrated:

- ✅ Free tier usage (Standard tier))
- ✅ Lambda IAM permissions (GetParameter/PutParameter)
- ✅ Terraform resource managementt
- ✅ Graceful error handling
- ✅ Environment variable configurationn
- ✅ Zero downtime deployment

---

## Migration Strategy: Parallel Operation → Switchover → Cleanup

### Phase 1: Create Parallel Parameter Store (1-2 hours)

**Goal**: Establish Parameter Store alongside Secrets Manager without affecting production.

#### 1.1 Design Parameter Structure

**Decision Point**: Single parameter (JSON) vs multiple parameters (individual secrets)?

**Option A: Single JSON Parameter** (Recommended - mirrors current structure)

- Name: `/vwc/dev/secrets` (single parameter))
- Value: JSON string with all 7 fields
- Pros: Simple migration, single IAM permission, atomic readss
- Cons: All-or-nothing updates, larger payload
- **Cost**: FREE (Standard tier, <4KB)

##### Option B: Individual Parameters

- Names: `/vwc/dev/mongodb-uri`, `/vwc/dev/auth0-domain`, etc..
- Values: Individual secret strings
- Pros: Granular permissions possible, smaller individual payloadss
- Cons: 7 IAM permissions needed, 7 API calls to load all secrets, more complex code
- **Cost**: FREE (Standard tier, each <4KB)

**Recommendation**: Option A (Single JSON) - Keep it simple, matches current `getSecrets()` pattern.

#### 1.2 Create Terraform Configuration

```hcl
# infra/main.tf - Add after auth0_token_cache resource

resource "aws_ssm_parameter" "application_secrets" {
  name        = "/vwc/${var.environment}/secrets"
  description = "Application secrets for Vehicle Wellness Center (MongoDB, Auth0, Gemini)"
  type        = "SecureString"  # Encrypted at rest with AWS KMS
  value       = jsonencode({
    MONGODB_URI                = "not-initialized"
    MONGODB_ATLAS_USERNAME     = "not-initialized"
    MONGODB_ATLAS_PASSWORD     = "not-initialized"
    AUTH0_DOMAIN               = "not-initialized"
    AUTH0_AUDIENCE             = "not-initialized"
    AUTH0_M2M_CLIENT_ID        = "not-initialized"
    AUTH0_M2M_CLIENT_SECRET    = "not-initialized"
    GOOGLE_GEMINI_API_KEY      = "not-initialized"
  })
  tier        = "Standard"  # Free tier

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "Application secrets - replacing Secrets Manager for cost optimization"
  }

  lifecycle {
    ignore_changes = [value, description]  # User manages values manually
  }
}
```

#### 1.3 Update Lambda IAM Role

```hcl
# infra/main.tf - Update vwc_lambda_secrets policy

resource "aws_iam_role_policy" "vwc_lambda_secrets" {
  name = "vwc-lambda-secrets-access"
  role = aws_iam_role.vwc_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = data.aws_secretsmanager_secret_version.mongodb_database_user.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = aws_ssm_parameter.auth0_token_cache.arn
      },
      {
        Effect = "Allow"
        Action = "ssm:GetParameter"  # Read-only for secrets
        Resource = aws_ssm_parameter.application_secrets.arn
      }
    ]
  })
}
```

#### 1.4 Update terraform-vwc IAM Policy

```json
// infra/terraform-vwc-core-policy-updated.json
// ParameterStoreManagement statement - add SecureString actions:
{
  "Sid": "ParameterStoreManagement",
  "Effect": "Allow",
  "Action": [
    "ssm:AddTagsToResource",
    "ssm:DeleteParameter",
    "ssm:GetParameter",
    "ssm:GetParameters",
    "ssm:ListTagsForResource",
    "ssm:PutParameter",
    "ssm:RemoveTagsFromResource"
  ],
  "Resource": "arn:aws:ssm:us-west-2:*:parameter/vwc/*"
}
```

#### 1.5 Add Lambda Environment Variable

```hcl
# infra/main.tf - Lambda environment block

environment {
  variables = {
    AWS_SECRET_ID              = data.aws_secretsmanager_secret_version.mongodb_database_user.secret_id
    SSM_SECRETS_PARAMETER_NAME = aws_ssm_parameter.application_secrets.name  # NEW
    MONGODB_DATABASE           = var.mongodb_database_name
    LAMBDA_APP_URL             = aws_apigatewayv2_api.vwc_api.api_endpoint
    NODE_ENV                   = var.environment
    AUTH0_TOKEN_PARAMETER_NAME = aws_ssm_parameter.auth0_token_cache.name
  }
}
```

**Deliverable**: Terraform apply creates Parameter Store parameter, updates Lambda IAM + environment variables.

---

### Phase 2: Implement Dual-Read Code (2-3 hours)

**Goal**: Lambda can read from BOTH Secrets Manager (primary) and Parameter Store (fallback/testing).

#### 2.1 Create New Parameter Store Module

```typescript
// backend/src/lib/parameterStore.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-west-2'
});

export interface AppSecrets {
  MONGODB_URI: string;
  MONGODB_ATLAS_USERNAME: string;
  MONGODB_ATLAS_PASSWORD: string;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  AUTH0_M2M_CLIENT_ID: string;
  AUTH0_M2M_CLIENT_SECRET: string;
  GOOGLE_GEMINI_API_KEY?: string;
}

let cachedSecrets: AppSecrets | null = null;

/**
 * Get application secrets from Parameter Store
 * 
 * Reads from SSM parameter at /vwc/{env}/secrets
 * Caches in memory for Lambda container lifetime
 * Expects JSON SecureString parameter
 * 
 * @returns Application secrets object
 * @throws Error if parameter not found or invalid JSON
 */
export async function getSecretsFromParameterStore(): Promise<AppSecrets> {
  // Return cached secrets if available
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const parameterName = process.env.SSM_SECRETS_PARAMETER_NAME || '/vwc/dev/secrets';

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true  // Decrypt SecureString values
    });

    const response = await ssmClient.send(command);

    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${parameterName} not found or empty`);
    }

    // Parse JSON value
    const secrets = JSON.parse(response.Parameter.Value) as AppSecrets;

    // Validate required fields
    const requiredFields = [
      'MONGODB_URI',
      'MONGODB_ATLAS_USERNAME',
      'MONGODB_ATLAS_PASSWORD',
      'AUTH0_DOMAIN',
      'AUTH0_AUDIENCE',
      'AUTH0_M2M_CLIENT_ID',
      'AUTH0_M2M_CLIENT_SECRET'
    ];

    for (const field of requiredFields) {
      if (!secrets[field as keyof AppSecrets]) {
        throw new Error(`Missing required secret field: ${field}`);
      }
    }

    // Cache for container lifetime
    cachedSecrets = secrets;
    return secrets;

  } catch (error) {
    console.error('Failed to get secrets from Parameter Store:', error);
    throw new Error(`Parameter Store secrets retrieval failed: ${error}`);
  }
}

/**
 * Clear cached secrets (useful for testing)
 */
export function clearSecretsCache(): void {
  cachedSecrets = null;
}
```

#### 2.2 Update mongodb.ts for Dual-Read

```typescript
// backend/src/lib/mongodb.ts - Add at top

import { getSecretsFromParameterStore } from './parameterStore';

// Update getSecrets function
export async function getSecrets(): Promise<AppSecrets> {
  // Try Parameter Store first if SSM_SECRETS_PARAMETER_NAME is set
  const useParameterStore = process.env.SSM_SECRETS_PARAMETER_NAME;
  
  if (useParameterStore) {
    try {
      console.log('Reading secrets from Parameter Store...');
      const secrets = await getSecretsFromParameterStore();
      console.log('✅ Successfully loaded secrets from Parameter Store');
      return secrets;
    } catch (error) {
      console.warn('⚠️  Parameter Store read failed, falling back to Secrets Manager:', error);
      // Fall through to Secrets Manager
    }
  }

  // Fallback to Secrets Manager (current implementation)
  console.log('Reading secrets from Secrets Manager...');
  // ... existing Secrets Manager code ...
}
```

**Testing Strategy**:

1. Deploy with `SSM_SECRETS_PARAMETER_NAME` unset → Uses Secrets Manager (current behavior)
2. Set `SSM_SECRETS_PARAMETER_NAME` but leave Parameter Store empty → Falls back to Secrets Manager
3. Populate Parameter Store → Uses Parameter Store successfully

**Deliverable**: Code deployed, dual-read working, all tests passing with Secrets Manager.

---

### Phase 3: Manual Parameter Store Population (30 mins)

**Goal**: Copy secrets from Secrets Manager to Parameter Store using AWS CLI.

#### 3.1 Export Secrets from Secrets Manager

```powershell
# Get current secrets as JSON

aws secretsmanager get-secret-value `
  --secret-id vehical-wellness-center-dev `
  --region us-west-2 `
  --profile terraform-vwc `
  --query SecretString `
  --output text > temp-secrets.json

# Review contents (ensure no extra formatting)

Get-Content temp-secrets.json
```

#### 3.2 Import to Parameter Store

```powershell
# Put secrets into Parameter Store (SecureString = encrypted)

aws ssm put-parameter `
  --name /vwc/dev/secrets `
  --value (Get-Content temp-secrets.json -Raw) `
  --type SecureString `
  --overwrite `
  --region us-west-2 `
  --profile terraform-vwc

# Verify parameter created

aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --with-decryption `
  --region us-west-2 `
  --profile terraform-vwc
```

#### 3.3 Secure Cleanup

```powershell
# Delete temporary file securely

Remove-Item temp-secrets.json -Force
```

**Deliverable**: Parameter Store contains all secrets, verified via CLI.

---

### Phase 4: Test Parameter Store Path (1-2 hours)

**Goal**: Validate Lambda can read from Parameter Store successfully.

#### 4.1 Update Lambda Environment Variable

```bash
# Temporarily enable Parameter Store (Terraform already has SSM_SECRETS_PARAMETER_NAME set)

npm run infra:apply  # Apply Terraform with environment variable
```

#### 4.2 Run Full Test Suite

```bash
# All tests should pass using Parameter Store secrets

npm run test
npm run test:integration
npx tsx backend/src/test-connection.ts
npx tsx backend/src/test-ai-chat.ts
```

#### 4.3 Monitor CloudWatch Logs

- Check Lambda logs for "✅ Successfully loaded secrets from Parameter Store""
- Verify no "⚠️ Parameter Store read failed" warnings
- Validate all API endpoints working correctly

#### 4.4 Performance Comparison

```typescript
// Add timing to getSecrets() for comparison
console.time('Secrets load time');
const secrets = await getSecrets();
console.timeEnd('Secrets load time');

// Expected:
// - Secrets Manager: ~50-150ms
// - Parameter Store: ~50-100ms (similar performance)
```

**Success Criteria**::

- ✅ All 35 tests passing
- ✅ No fallback warnings in logss
- ✅ CloudWatch shows "Parameter Store" in logs
- ✅ API endpoints responding normallyy
- ✅ Integration tests pass end-to-end

**Deliverable**: Confirmation that Parameter Store works as drop-in replacement.

---

### Phase 5: Update Documentation (1 hour)

**Goal**: Update all docs to reference Parameter Store instead of Secrets Manager.

#### 5.1 Files to Update

- [ ] `README.md` - Prerequisites, setup instructionss
- [ ] `backend/README.md` - Environment variables, deployment
- [ ] `infra/README.md` - Infrastructure overview, secrets managementt
- [ ] `docs/MongoDB-Atlas-Setup-Guide.md` - References to secrets
- [ ] `docs/Auth0-Setup-Guide.md` - M2M credential storagee
- [ ] `docs/atlas-secrets-todo.md` - Rename/update to parameter-store-setup.md
- [ ] `docs/auth0-secrets-todo.md` - Update for Parameter Storee
- [ ] `infra/secret-example.json` - Rename to parameter-example.json
- [ ] `.github/copilot-instructions.md` - Update development rules

#### 5.2 Create New Migration Guide

```markdown
# docs/parameter-store-setup.md

## Manual Parameter Store Setup

### Prerequisites

- AWS CLI installed with `terraform-vwc` profile configuredd
- Access to current Secrets Manager secret (for migration)

### Initial Setup (New Projects)


1. Copy parameter template:

   ```bash
   cp infra/parameter-example.json temp-secrets.json
   ```

1. Fill in all values in temp-secrets.json

2. Create Parameter Store parameter:

   ```powershell
   aws ssm put-parameter `
     --name /vwc/dev/secrets `
     --value (Get-Content temp-secrets.json -Raw) `
     --type SecureString `
     --region us-west-2 `
     --profile terraform-vwc
   ```

3. Delete temp file: `Remove-Item temp-secrets.json -Force`

### Migration from Secrets Manager

[Include migration steps from Phase 3]

### Updating Secrets

```powershell
# Get current value

aws ssm get-parameter --name /vwc/dev/secrets --with-decryption --query Parameter.Value --output text > temp.json

# Edit temp.json with your changes

# Update parameter

aws ssm put-parameter --name /vwc/dev/secrets --value (Get-Content temp.json -Raw) --type SecureString --overwrite

# Cleanup

Remove-Item temp.json -Force
```

```text
(Example output from AWS CLI showing successful update)
```

**Deliverable**: All documentation updated, migration guide created.

---

### Phase 6: Remove Secrets Manager (1 hour)

**Goal**: Clean removal of Secrets Manager resources and code.

#### 6.1 Update Terraform to Remove Secrets Manager

```hcl
# infra/main.tf - REMOVE these blocks:

# DELETE this data source

# data "aws_secretsmanager_secret_version" "mongodb_database_user" {
#   secret_id = var.mongodb_database_user_secret_id

# }

# DELETE this variable

# variable "mongodb_database_user_secret_id" {
#   description = "Secrets Manager identifier..."

#   type        = string
# }
```

#### 6.2 Update Lambda IAM Policy

```hcl
# infra/main.tf - Remove Secrets Manager permissions

resource "aws_iam_role_policy" "vwc_lambda_secrets" {
  name = "vwc-lambda-secrets-access"
  role = aws_iam_role.vwc_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # REMOVE Secrets Manager statement entirely
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = aws_ssm_parameter.auth0_token_cache.arn
      },
      {
        Effect = "Allow"
        Action = "ssm:GetParameter"
        Resource = aws_ssm_parameter.application_secrets.arn
      }
    ]
  })
}
```

#### 6.3 Update Lambda Environment

```hcl
# infra/main.tf - Remove AWS_SECRET_ID

environment {
  variables = {
    # REMOVE: AWS_SECRET_ID = ...
    SSM_SECRETS_PARAMETER_NAME = aws_ssm_parameter.application_secrets.name
    MONGODB_DATABASE           = var.mongodb_database_name
    LAMBDA_APP_URL             = aws_apigatewayv2_api.vwc_api.api_endpoint
    NODE_ENV                   = var.environment
    AUTH0_TOKEN_PARAMETER_NAME = aws_ssm_parameter.auth0_token_cache.name
  }
}
```

#### 6.4 Update terraform.tfvars.example

```hcl
# infra/terraform.tfvars.example

# REMOVE this line:
# mongodb_database_user_secret_id = "vehical-wellness-center-dev"
```

#### 6.5 Simplify Backend Code

```typescript
// backend/src/lib/mongodb.ts - Remove Secrets Manager code entirely

export async function getSecrets(): Promise<AppSecrets> {
  // Parameter Store is now the only source
  return await getSecretsFromParameterStore();
}

// REMOVE: Old Secrets Manager client code
// REMOVE: SecretsManagerClient import
// REMOVE: GetSecretValueCommand import
```

#### 6.6 Update load-tf-env.js

```javascript
// infra/load-tf-env.js
// REMOVE Secrets Manager secret loading
// REMOVE TF_VAR_mongodb_database_user_secret_id export
// Keep only Parameter Store references
```

#### 6.7 Apply Terraform Changes

```bash
npm run infra:apply
# Expected: 0 to add, 2 to change (Lambda env vars + IAM policy), 0 to destroy

# Secrets Manager secret remains in AWS but is no longer referenced
```

**Deliverable**: Terraform state clean, Lambda using only Parameter Store.

---

### Phase 7: Delete Secrets Manager Secret (5 mins)

**Goal**: Remove Secrets Manager secret to stop billing.

#### 7.1 Delete via AWS Console

1. Navigate to AWS Secrets Manager console
2. Select `vehical-wellness-center-dev`
3. Actions → Delete secret
4. Choose "Schedule deletion" with 7-day recovery window (recommended)
5. Confirm deletion

**OR via AWS CLI:**

```powershell
aws secretsmanager delete-secret `
  --secret-id vehical-wellness-center-dev `
  --recovery-window-in-days 7 `
  --region us-west-2 `
  --profile terraform-vwc
```

#### 7.2 Verify No Impact

- Run full test suite: `npm run test``
- Test all API endpoints
- Check CloudWatch logs for errors

**Rollback Plan**: If issues arise within 7 days, restore secret:

```powershell
aws secretsmanager restore-secret `
  --secret-id vehical-wellness-center-dev `
  --region us-west-2 `
  --profile terraform-vwc
```

**Deliverable**: Secrets Manager secret deleted, $4.80/year cost savings achieved.

---

### Phase 8: Final Cleanup (30 mins)

**Goal**: Remove all Secrets Manager references from codebase.

#### 8.1 Update terraform-vwc IAM Policy

```json
// infra/terraform-vwc-core-policy-updated.json
// REMOVE SecretsManagerAccess statement entirely
```

#### 8.2 Remove Dead Files

```bash
# Files to delete:

rm docs/atlas-secrets-todo.md  # Replaced by parameter-store-setup.md
rm docs/auth0-secrets-todo.md  # Replaced by parameter-store-setup.md
rm infra/secret-example.json   # Replaced by parameter-example.json
```

#### 8.3 Search and Replace

```bash
# Find any remaining "Secrets Manager" references

grep -r "Secrets Manager" . --include="*.md" --include="*.ts" --include="*.js"
grep -r "secretsmanager" . --include="*.md" --include="*.ts" --include="*.js"

# Update any found references to "Parameter Store"
```

#### 8.4 Final Test Suite

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npx tsx backend/src/test-connection.ts
npx tsx backend/src/test-ai-chat.ts
```

**Deliverable**: Clean codebase with no Secrets Manager remnants.

---

## Commit Strategy

### Commit 1: Infrastructure Foundation

```bash
git add infra/ .github/copilot-instructions.md
git commit -m "infra: add Parameter Store for application secrets (parallel to Secrets Manager)"
```

**Files**: Terraform config, IAM policies, copilot instructions

### Commit 2: Dual-Read Implementation

```bash
git add backend/src/lib/
git commit -m "feat(backend): implement dual-read secrets (Parameter Store with Secrets Manager fallback)"
```

**Files**: parameterStore.ts, updated mongodb.ts

### Commit 3: Enable Parameter Store

```bash
# After manual population and testing

git add CHANGELOG.md
git commit -m "feat(infra): enable Parameter Store secrets in Lambda environment"
```

**Files**: Lambda env vars, CHANGELOG

### Commit 4: Update Documentation

```bash
git add docs/ README.md backend/README.md infra/README.md
git commit -m "docs: update all documentation for Parameter Store migration"
```

**Files**: All docs, setup guides, examples

### Commit 5: Remove Secrets Manager

```bash
git add infra/ backend/src/lib/ CHANGELOG.md
git commit -m "refactor: remove Secrets Manager dependency - $4.80/year cost savings"
```

***Files**: Terraform cleanup, simplified code, changelog

### Commit 6: Final Cleanup

```bash
git add .
git commit -m "chore: remove remaining Secrets Manager references and dead files"
```

***Files**: IAM policy, deleted files, search/replace updates

---

## Risk Mitigation

### Rollback Plan (Per Phase)

**Phase 1-2**: No risk - Secrets Manager still primaryy

- Action: None needed, Parameter Store not yet used

**Phase 3-4**: Parameter Store populated but not in usee

- Action: Delete Parameter Store parameter, no code changes needed

**Phase 5-6**: Using Parameter Store, Secrets Manager still existss

- Rollback: Unset `SSM_SECRETS_PARAMETER_NAME` environment variable, redeploy Lambda
- Time: ~2 minutes

**Phase 7**: Secrets Manager deleted (7-day recovery window))

- Rollback: Restore secret via AWS CLI/Console, set `AWS_SECRET_ID` env var, redeploy
- Time: ~5 minutes

**Phase 8**: Secrets Manager permanently deletedd

- Rollback: Recreate secret manually, restore old code from git history
- Time: ~30 minutes

### Testing Checkpoints

- ✅ After Phase 2: Tests pass with Secrets Managerr
- ✅ After Phase 4: Tests pass with Parameter Store
- ✅ After Phase 6: Tests pass without Secrets Manager referencee
- ✅ After Phase 8: Full regression test suite

### Monitoring

- CloudWatch logs: Watch for "Parameter Store" vs "Secrets Manager" in Lambda logss
- Lambda errors: Monitor for SSM permission errors or JSON parsing failures
- API Gateway: Watch 5xx error rates during cutoverr
- Integration tests: Run every 15 minutes during migration (automated)

---

## Success Metrics

### Cost Savings

- **Before**: $0.40/month ($4.80/year) for Secrets Managerr
- **After**: $0.00/month (Parameter Store Standard tier free)
- **Annual Savings**: $4.80 (100% reduction)

### Performance

- **Secrets Manager**: ~50-150ms per secret retrievall
- **Parameter Store**: ~50-100ms per parameter retrieval
- **Expected Impact**: Negligible (<50ms difference), similar caching patterns

### Security

- **Encryption at Rest**: Both use AWS KMS (SecureString parameter type))
- **Encryption in Transit**: Both use TLS
- **IAM Permissions**: Similar granularity (resource-level ARNs))
- **Audit Logging**: Both support CloudTrail
- **Conclusion**: No security degradation

### Operational

- **Ease of Updates**: Similar (AWS CLI or Console))
- **Terraform Support**: Both fully supported
- **Backup/Recovery**: Parameter Store lacks versioning (minor downside))
- **Conclusion**: Slightly less convenient, but acceptable for cost savings

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Create Parallel Parameter Store | 1-2 hours | None |
| 2. Implement Dual-Read Code | 2-3 hours | Phase 1 complete |
| 3. Manual Parameter Population | 30 mins | Phases 1-2 complete |
| 4. Test Parameter Store Path | 1-2 hours | Phase 3 complete |
| 5. Update Documentation | 1 hour | Phase 4 validated |
| 6. Remove Secrets Manager | 1 hour | Phase 5 complete |
| 7. Delete Secrets Manager Secret | 5 mins | Phase 6 validated |
| 8. Final Cleanup | 30 mins | Phase 7 complete |

**Total Estimated Time**: 7-10 hours over 2-3 sessions

**Recommended Schedule**::

- **Session 1** (3-4 hours): Phases 1-2, commit infrastructure + dual-read code
- **Session 2** (2-3 hours): Phases 3-4, populate + test, commit successful cutoverr
- **Session 3** (2-3 hours): Phases 5-8, documentation + cleanup, final commits

---

## References

- AWS Parameter Store Pricing: <https://aws.amazon.com/systems-manager/pricing//>
- AWS Secrets Manager Pricing: <https://aws.amazon.com/secrets-manager/pricing/>
- Parameter Store vs Secrets Manager: <https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-about-examples.htmll>
- SecureString Parameters: <https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-securestring.html>
- Recent Success: Parameter Store token cache implementation (commit 99065c8)
