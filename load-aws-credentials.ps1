# Set AWS profile for VWC Terraform operations
# Source this file before running Terraform commands
#
# Usage: . ./load-aws-credentials.ps1

$env:AWS_PROFILE = "terraform-vwc"
$env:AWS_REGION = "us-west-2"
$env:AWS_SECRET_ID = "vehical-wellness-center-dev"

Write-Host "✅ AWS environment configured for Terraform!" -ForegroundColor Green
Write-Host "Profile: $env:AWS_PROFILE" -ForegroundColor Cyan
Write-Host "Region: $env:AWS_REGION" -ForegroundColor Cyan
Write-Host "Secret ID: $env:AWS_SECRET_ID" -ForegroundColor Cyan
