#!/usr/bin/env tsx
/**
 * Quick test to verify NCAP ratings are being fetched in deployed Lambda
 */

const API_BASE_URL = 'https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com';
const TEST_VEHICLE_ID = '673b1aa15ec85a16c47ba4e9'; // Mike's Jeep Cherokee

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getAuth0Token(): Promise<string> {
  console.log('🔐 Obtaining Auth0 token...');
  
  // These values need to be in Parameter Store
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'dev-zgjzxdnwzs2vw1j2.us.auth0.com';
  const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || 'https://api.vehicle-wellness-center.com';
  const AUTH0_M2M_CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
  const AUTH0_M2M_CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;
  
  if (!AUTH0_M2M_CLIENT_ID || !AUTH0_M2M_CLIENT_SECRET) {
    throw new Error('AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET must be set');
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: AUTH0_M2M_CLIENT_ID,
      client_secret: AUTH0_M2M_CLIENT_SECRET,
      audience: AUTH0_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth0 token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as Auth0TokenResponse;
  console.log('✅ Token obtained\n');
  return data.access_token;
}

interface NCAPRating {
  overall?: number;
  frontDriver?: number;
  frontPassenger?: number;
  side?: number;
  rollover?: number;
  rolloverPossibility?: number;
  vehicleId?: number;
  lastUpdated?: string;
}

interface SafetyResponse {
  success: boolean;
  vehicleId: string;
  summary?: {
    hasRecalls?: boolean;
    recallCount?: number;
    hasComplaints?: boolean;
    complaintCount?: number;
    hasNCAPRatings?: boolean;
    overallRating?: number;
  };
  ncapRating?: NCAPRating;
}

async function testSafetyEndpoint(token: string): Promise<void> {
  console.log(`🛡️ Testing safety endpoint with NCAP integration...`);
  console.log(`   Vehicle ID: ${TEST_VEHICLE_ID}`);
  console.log(`   URL: ${API_BASE_URL}/vehicles/${TEST_VEHICLE_ID}/safety\n`);
  
  const response = await fetch(`${API_BASE_URL}/vehicles/${TEST_VEHICLE_ID}/safety`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Safety request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json() as SafetyResponse;
  
  console.log('✅ Response received!');
  console.log('\n📊 Summary:');
  console.log(`   Success: ${data.success}`);
  console.log(`   Has NCAP Ratings: ${data.summary?.hasNCAPRatings || false}`);
  console.log(`   Overall Rating: ${data.summary?.overallRating || 'N/A'} stars`);
  
  if (data.ncapRating) {
    console.log('\n⭐ NCAP Safety Ratings:');
    console.log(`   Overall: ${data.ncapRating.overall || 'N/A'} stars`);
    console.log(`   Front Driver: ${data.ncapRating.frontDriver || 'N/A'} stars`);
    console.log(`   Front Passenger: ${data.ncapRating.frontPassenger || 'N/A'} stars`);
    console.log(`   Side: ${data.ncapRating.side || 'N/A'} stars`);
    console.log(`   Rollover: ${data.ncapRating.rollover || 'N/A'} stars`);
    console.log(`   Rollover Risk: ${data.ncapRating.rolloverPossibility || 'N/A'}%`);
    console.log(`   NCAP Vehicle ID: ${data.ncapRating.vehicleId || 'N/A'}`);
    console.log(`   Last Updated: ${data.ncapRating.lastUpdated ? new Date(data.ncapRating.lastUpdated).toLocaleString() : 'N/A'}`);
    
    console.log('\n✅ NCAP Integration Working! Phase 11 deployment successful.');
  } else {
    console.log('\n⚠️ No NCAP ratings found in response');
    console.log('   This could mean:');
    console.log('   - Lambda still deploying (check AWS Console)');
    console.log('   - Vehicle specs not available (run enrich first)');
    console.log('   - NCAP API returned no ratings for this vehicle');
  }
}

async function main() {
  console.log('🚗 NCAP Deployment Test');
  console.log('======================\n');

  try {
    const token = await getAuth0Token();
    await testSafetyEndpoint(token);
    
    console.log('\n✅ Test complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

void main();
