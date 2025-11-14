/**
 * Test Parameter Store secrets retrieval
 * 
 * Tests the dual-read implementation to verify:
 * 1. Parameter Store secrets can be retrieved
 * 2. Secrets contain all required fields
 * 3. MongoDB connection works with Parameter Store secrets
 */

import { getSecretsFromParameterStore } from './lib/parameterStore';
import { MongoClient } from 'mongodb';

async function testParameterStore() {
  console.log('🧪 Testing Parameter Store secrets retrieval...\n');

  try {
    // Test 1: Retrieve secrets from Parameter Store
    console.log('📥 Step 1: Fetching secrets from Parameter Store...');
    const secrets = await getSecretsFromParameterStore();
    console.log('✅ Successfully retrieved secrets from Parameter Store\n');

    // Test 2: Validate secret fields
    console.log('🔍 Step 2: Validating secret fields...');
    const requiredFields = [
      'MONGODB_ATLAS_HOST',
      'MONGODB_ATLAS_USERNAME',
      'MONGODB_ATLAS_PASSWORD',
      'AUTH0_DOMAIN',
      'AUTH0_AUDIENCE',
      'AUTH0_M2M_CLIENT_ID',
      'AUTH0_M2M_CLIENT_SECRET'
    ];

    for (const field of requiredFields) {
      if (secrets[field as keyof typeof secrets]) {
        console.log(`  ✓ ${field}: ${field.includes('PASSWORD') || field.includes('SECRET') ? '[REDACTED]' : secrets[field as keyof typeof secrets]}`);
      } else {
        console.error(`  ✗ ${field}: MISSING`);
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (secrets.GOOGLE_GEMINI_API_KEY) {
      console.log(`  ✓ GOOGLE_GEMINI_API_KEY: [REDACTED] (optional field present)`);
    } else {
      console.log(`  ⚠ GOOGLE_GEMINI_API_KEY: Not set (optional)`);
    }

    console.log('✅ All required fields present\n');

    // Test 3: Test MongoDB connection
    console.log('🔌 Step 3: Testing MongoDB connection with Parameter Store secrets...');
    const uri = `mongodb+srv://${encodeURIComponent(secrets.MONGODB_ATLAS_USERNAME)}:${encodeURIComponent(secrets.MONGODB_ATLAS_PASSWORD)}@${secrets.MONGODB_ATLAS_HOST}/?retryWrites=true&w=majority&appName=VehicleWellnessCenter`;
    
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    const dbName = process.env.MONGODB_DATABASE || 'vehicle_wellness_center';
    const db = client.db(dbName);
    
    // Test a simple operation
    const collections = await db.listCollections().toArray();
    console.log(`✅ Connected to MongoDB: ${dbName}`);
    console.log(`   Found ${collections.length} collections: ${collections.map(c => c.name).join(', ')}\n`);

    await client.close();

    // Success summary
    console.log('═══════════════════════════════════════════');
    console.log('🎉 ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════');
    console.log('✅ Parameter Store secrets retrieval works');
    console.log('✅ All required fields present and valid');
    console.log('✅ MongoDB connection successful');
    console.log('');
    console.log('💡 Dual-read implementation ready for production use');
    console.log('   Lambda will use Parameter Store when SSM_SECRETS_PARAMETER_NAME is set');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('═══════════════════════════════════════════');
    console.error('Error:', error);
    console.error('');
    process.exit(1);
  }
}

void testParameterStore();
