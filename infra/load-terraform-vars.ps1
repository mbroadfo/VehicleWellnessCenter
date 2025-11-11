# Terraform Variables for Vehicle Wellness Center
# 
# Load secrets from AWS Secrets Manager and set these as environment variables:
# $env:TF_VAR_mongodb_atlas_public_key = "..."
# $env:TF_VAR_mongodb_atlas_private_key = "..."
# $env:TF_VAR_mongodb_atlas_org_id = "..."
# $env:TF_VAR_mongodb_atlas_project_id = "..."

# Retrieve secrets from AWS Secrets Manager
$secretJson = aws secretsmanager get-secret-value `
    --secret-id vehical-wellness-center-dev `
    --region us-west-2 `
    --query SecretString `
    --output text `
    --profile terraform-vwc

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to retrieve secrets from AWS Secrets Manager" -ForegroundColor Red
    exit 1
}

$secrets = $secretJson | ConvertFrom-Json

# Get the secret ARN
$secretArn = aws secretsmanager describe-secret `
    --secret-id vehical-wellness-center-dev `
    --region us-west-2 `
    --query ARN `
    --output text `
    --profile terraform-vwc

# Set Terraform variables from secrets
$env:TF_VAR_mongodb_atlas_public_key = $secrets.MONGODB_ATLAS_PUBLIC_KEY
$env:TF_VAR_mongodb_atlas_private_key = $secrets.MONGODB_ATLAS_PRIVATE_KEY
$env:TF_VAR_mongodb_atlas_org_id = $secrets.MONGODB_ATLAS_ORG_ID
$env:TF_VAR_mongodb_atlas_project_id = $secrets.MONGODB_ATLAS_PROJECT_ID
$env:TF_VAR_mongodb_database_user_secret_id = $secretArn

Write-Host "✅ Terraform variables loaded from AWS Secrets Manager!" -ForegroundColor Green
Write-Host "Secret ARN: $secretArn" -ForegroundColor Cyan
Write-Host "MongoDB Atlas Org ID: $($secrets.MONGODB_ATLAS_ORG_ID)" -ForegroundColor Cyan
Write-Host "MongoDB Atlas Project ID: $($secrets.MONGODB_ATLAS_PROJECT_ID)" -ForegroundColor Cyan
Write-Host "`nRun 'terraform init' then 'terraform plan' or 'terraform apply'" -ForegroundColor Yellow
