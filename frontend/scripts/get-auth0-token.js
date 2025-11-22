/**
 * Fetch Auth0 M2M token for frontend development
 * This script retrieves a valid JWT token from Auth0 that can be used
 * to authenticate with the API Gateway during local development.
 * 
 * Usage:
 *   node frontend/scripts/get-auth0-token.js
 * 
 * The token will be printed to stdout and saved to .env.local
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const region = 'us-west-2';
const ssmClient = new SSMClient({ region });

async function getAuth0Credentials() {
  try {
    const command = new GetParameterCommand({
      Name: '/vwc/dev/secrets',
      WithDecryption: true,
    });

    const response = await ssmClient.send(command);
    const secrets = JSON.parse(response.Parameter.Value);

    return {
      domain: secrets.AUTH0_DOMAIN,
      clientId: secrets.AUTH0_M2M_CLIENT_ID,
      clientSecret: secrets.AUTH0_M2M_CLIENT_SECRET,
      audience: secrets.AUTH0_AUDIENCE,
    };
  } catch (error) {
    console.error('❌ Failed to retrieve Auth0 credentials from Parameter Store');
    console.error('   Make sure AWS credentials are configured and you have access to /vwc/dev/secrets');
    throw error;
  }
}

async function fetchAuth0Token(credentials) {
  const tokenUrl = `https://${credentials.domain}/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      audience: credentials.audience,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Auth0 token request failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function main() {
  console.log('🔐 Fetching Auth0 token for frontend development...\n');

  const credentials = await getAuth0Credentials();
  console.log(`✅ Retrieved credentials for: ${credentials.domain}`);

  const token = await fetchAuth0Token(credentials);
  console.log(`✅ Token retrieved successfully\n`);

  // Write to .env.local for Vite
  const envContent = `# Auto-generated Auth0 token for development
# Valid for 24 hours from generation time
# Regenerate with: node frontend/scripts/get-auth0-token.js
VITE_AUTH0_TOKEN=${token}
`;

  const fs = await import('fs');
  const path = await import('path');
  const envPath = path.join(process.cwd(), 'frontend', '.env.local');
  
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Token saved to: frontend/.env.local`);
  console.log(`\nℹ️  Restart your dev server (npm run dev) to use the new token\n`);
  console.log(`📋 Token (for manual use):\n${token}\n`);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
