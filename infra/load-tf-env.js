#!/usr/bin/env node
/**
 * Load AWS credentials and Terraform variables from Parameter Store
 * Sets environment variables for Terraform CLI execution
 */

const { execSync } = require('child_process');

// AWS Configuration
process.env.AWS_PROFILE = 'terraform-vwc';
process.env.AWS_REGION = 'us-west-2';
process.env.SSM_SECRETS_PARAMETER_NAME = '/vwc/dev/secrets';

console.log('✅ AWS environment configured for Terraform!');
console.log(`Profile: ${process.env.AWS_PROFILE}`);
console.log(`Region: ${process.env.AWS_REGION}`);
console.log(`Parameter: ${process.env.SSM_SECRETS_PARAMETER_NAME}\n`);

// Fetch secrets from Parameter Store
let secretJson;
try {
  const parameterOutput = execSync(
    `aws ssm get-parameter --name ${process.env.SSM_SECRETS_PARAMETER_NAME} --with-decryption --region ${process.env.AWS_REGION} --query Parameter.Value --output text`,
    { encoding: 'utf-8' }
  );
  secretJson = JSON.parse(parameterOutput);
} catch (error) {
  console.error('❌ Failed to retrieve secrets from Parameter Store');
  console.error(error.message);
  process.exit(1);
}

// Extract Terraform variables
const tfVars = {
  TF_VAR_mongodb_atlas_public_key: secretJson.MONGODB_ATLAS_PUBLIC_KEY,
  TF_VAR_mongodb_atlas_private_key: secretJson.MONGODB_ATLAS_PRIVATE_KEY,
  TF_VAR_mongodb_atlas_org_id: secretJson.MONGODB_ATLAS_ORG_ID,
  TF_VAR_mongodb_atlas_project_id: secretJson.MONGODB_ATLAS_PROJECT_ID,
  TF_VAR_auth0_domain: secretJson.AUTH0_DOMAIN,
  TF_VAR_auth0_audience: secretJson.AUTH0_AUDIENCE,
};

// Set environment variables
Object.entries(tfVars).forEach(([key, value]) => {
  process.env[key] = value;
});

console.log('✅ Terraform variables loaded from Parameter Store!');
console.log(`MongoDB Atlas Org ID: ${secretJson.MONGODB_ATLAS_ORG_ID}`);
console.log(`MongoDB Atlas Project ID: ${secretJson.MONGODB_ATLAS_PROJECT_ID}\n`);

// If a command was provided as argument, execute it in the infra directory
if (process.argv.length > 2) {
  // Get command and any additional arguments
  const args = process.argv.slice(2);
  const command = args.join(' ');
  
  // Auto-format Terraform files before plan or apply
  if (command.includes('terraform plan') || command.includes('terraform apply')) {
    console.log('🎨 Formatting Terraform files...');
    try {
      const path = require('path');
      const infraDir = path.dirname(__filename);
      execSync('terraform fmt', { 
        cwd: infraDir,
        stdio: 'inherit'
      });
      console.log('✅ Terraform files formatted\n');
    } catch (error) {
      console.warn('⚠️  terraform fmt failed, continuing anyway...\n');
    }
  }
  
  console.log(`Executing: ${command}\n`);
  
  try {
    const path = require('path');
    const infraDir = path.dirname(__filename);
    
    execSync(command, { 
      stdio: 'inherit',
      env: process.env,
      cwd: infraDir,
      shell: true
    });
  } catch (error) {
    process.exit(error.status || 1);
  }
} else {
  console.log('Environment variables set. You can now run Terraform commands.');
  console.log('Or run: node load-tf-env.js <command>');
}
