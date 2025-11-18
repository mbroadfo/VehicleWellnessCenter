#!/usr/bin/env tsx
/**
 * Quick test of enrich and safety endpoints
 */

import { getSecretsFromParameterStore } from './lib/parameterStore.js';

const API_BASE_URL = 'https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com';
const VEHICLE_ID = '691bb2c21e0a903ed93c5838';

async function getToken(): Promise<string> {
  const secrets = await getSecretsFromParameterStore();
  const response = await fetch(`https://${secrets.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: secrets.AUTH0_M2M_CLIENT_ID,
      client_secret: secrets.AUTH0_M2M_CLIENT_SECRET,
      audience: secrets.AUTH0_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  });
  
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function testEndpoint(path: string, method: string, token: string): Promise<void> {
  console.log(`\n🔍 Testing ${method} ${path}...`);
  
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  console.log(`   Status: ${response.status} ${response.statusText}`);
  
  if (response.ok) {
    const data = await response.json() as Record<string, unknown>;
    console.log(`   ✅ Success!`);
    console.log(`   Response keys: ${Object.keys(data).join(', ')}`);
  } else {
    console.log(`   ❌ Failed`);
    console.log(`   Body: ${await response.text()}`);
  }
}

async function main() {
  console.log('🧪 API Endpoint Test\n');
  
  const token = await getToken();
  console.log('✅ Got Auth0 token');
  
  await testEndpoint(`/vehicles/${VEHICLE_ID}/overview`, 'GET', token);
  await testEndpoint(`/vehicles/${VEHICLE_ID}/enrich`, 'POST', token);
  await testEndpoint(`/vehicles/${VEHICLE_ID}/safety`, 'GET', token);
  
  process.exit(0);
}

void main();
