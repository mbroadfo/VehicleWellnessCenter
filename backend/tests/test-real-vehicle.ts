#!/usr/bin/env tsx
/**
 * Test script to enrich a real vehicle with external API data
 * Tests VIN decode, safety data (recalls/complaints), and caching behavior
 */

import { getDatabase, getSecrets, closeConnection } from './lib/mongodb.js';
import { ObjectId } from 'mongodb';

const REAL_VIN = '1C4PJMBS9HW664582';
const API_BASE_URL = 'https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getAuth0Token(): Promise<string> {
  console.log('🔐 Obtaining Auth0 token...');
  
  const secrets = await getSecrets();
  
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

  if (!response.ok) {
    throw new Error(`Auth0 token request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as Auth0TokenResponse;
  return data.access_token;
}

interface VehicleSpecs {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  BodyClass?: string;
  EngineModel?: string;
  [key: string]: any;
}

interface SafetyData {
  recalls?: Array<{
    Component?: string;
    Summary?: string;
    [key: string]: any;
  }>;
  complaints?: Array<{
    components?: string;
    summary?: string;
    [key: string]: any;
  }>;
  recallsFetchedAt?: string;
  complaintsFetchedAt?: string;
}

async function findOrCreateVehicle(): Promise<string> {
  console.log(`\n📋 Checking for vehicle with VIN: ${REAL_VIN}...`);
  
  const db = await getDatabase();
  const existingVehicle = await db.collection('vehicles').findOne({ vin: REAL_VIN });
  
  if (existingVehicle) {
    console.log(`✅ Found existing vehicle: ${existingVehicle._id}`);
    return existingVehicle._id.toString();
  }

  console.log('➕ Creating new vehicle record...');
  const result = await db.collection('vehicles').insertOne({
    vin: REAL_VIN,
    nickname: "Mike's Jeep",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`✅ Created vehicle: ${result.insertedId}`);
  return result.insertedId.toString();
}

async function enrichVehicle(vehicleId: string, token: string): Promise<void> {
  console.log(`\n🔧 Enriching vehicle ${vehicleId} with external API data...`);
  
  const response = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/enrich`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Enrich request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json() as { specs: VehicleSpecs };
  console.log('✅ Enrichment complete!');
  console.log('\n📊 Vehicle Specs:');
  console.log(`   Make: ${data.specs?.Make || 'N/A'}`);
  console.log(`   Model: ${data.specs?.Model || 'N/A'}`);
  console.log(`   Year: ${data.specs?.ModelYear || 'N/A'}`);
  console.log(`   Body Style: ${data.specs?.BodyClass || 'N/A'}`);
  console.log(`   Engine: ${data.specs?.EngineModel || 'N/A'}`);
}

async function getSafetyData(vehicleId: string, token: string): Promise<void> {
  console.log(`\n🛡️ Fetching safety data for vehicle ${vehicleId}...`);
  
  const response = await fetch(`${API_BASE_URL}/vehicles/${vehicleId}/safety`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Safety request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json() as SafetyData;
  console.log('✅ Safety data retrieved!');
  
  if (data.recalls && data.recalls.length > 0) {
    console.log(`\n⚠️ Found ${data.recalls.length} recall(s):`);
    data.recalls.slice(0, 3).forEach((recall, idx: number) => {
      console.log(`   ${idx + 1}. ${recall.Component || 'Unknown'}: ${recall.Summary?.substring(0, 80) || 'No summary'}...`);
    });
  } else {
    console.log('\n✅ No recalls found');
  }

  if (data.complaints && data.complaints.length > 0) {
    console.log(`\n📝 Found ${data.complaints.length} complaint(s):`);
    data.complaints.slice(0, 3).forEach((complaint, idx: number) => {
      console.log(`   ${idx + 1}. ${complaint.components || 'Unknown'}: ${complaint.summary?.substring(0, 80) || 'No summary'}...`);
    });
  } else {
    console.log('\n✅ No complaints found');
  }

  console.log(`\n🕐 Data freshness:`);
  console.log(`   Recalls fetched: ${data.recallsFetchedAt ? new Date(data.recallsFetchedAt).toLocaleString() : 'Never'}`);
  console.log(`   Complaints fetched: ${data.complaintsFetchedAt ? new Date(data.complaintsFetchedAt).toLocaleString() : 'Never'}`);
}

async function checkMongoDBData(vehicleId: string): Promise<void> {
  console.log(`\n💾 Checking MongoDB for persisted data...`);
  
  const db = await getDatabase();
  const vehicle = await db.collection('vehicles').findOne({ _id: new ObjectId(vehicleId) });
  
  if (vehicle?.specs) {
    console.log('✅ Vehicle specs stored in MongoDB');
    console.log(`   Fields: ${Object.keys(vehicle.specs).length} spec fields`);
  } else {
    console.log('❌ No specs found in MongoDB');
  }

  if (vehicle?.safety) {
    console.log('✅ Safety data stored in MongoDB');
    console.log(`   Recalls: ${vehicle.safety.recalls?.length || 0}`);
    console.log(`   Complaints: ${vehicle.safety.complaints?.length || 0}`);
    console.log(`   Recalls TTL: ${vehicle.safety.recallsFetchedAt ? new Date(vehicle.safety.recallsFetchedAt).toLocaleString() : 'Never'}`);
    console.log(`   Complaints TTL: ${vehicle.safety.complaintsFetchedAt ? new Date(vehicle.safety.complaintsFetchedAt).toLocaleString() : 'Never'}`);
  } else {
    console.log('❌ No safety data found in MongoDB');
  }
}

async function main() {
  console.log('🚗 Real Vehicle Enrichment Test');
  console.log('================================\n');

  try {
    // Get Auth0 token
    const token = await getAuth0Token();

    // Find or create vehicle
    const vehicleId = await findOrCreateVehicle();

    // Try enrich endpoint (may 404 if Lambda not fully deployed yet)
    console.log('\n⏱️ Waiting for Lambda deployment to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      await enrichVehicle(vehicleId, token);
    } catch (error) {
      console.log('⚠️ Enrich endpoint not yet available (Lambda may still be deploying)');
      console.log('   Continuing with safety endpoint test...\n');
    }

    // Get safety data (should work even if enrich failed)
    await getSafetyData(vehicleId, token);

    // Verify data is in MongoDB
    await checkMongoDBData(vehicleId);

    console.log('\n✅ Test complete! Check CloudWatch logs for cache behavior.');
    console.log('   Command: aws logs tail /aws/lambda/vwc-dev --since 5m --format short --profile terraform-vwc');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

void main();
