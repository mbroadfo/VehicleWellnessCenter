/**
 * Manual test script for Honda service history import
 * 
 * Usage:
 * 1. Set HONDA_CONTENT_FILE to path of file containing pasted Honda HTML
 * 2. Set VEHICLE_ID to your vehicle's MongoDB ObjectId
 * 3. Run: npm run test:honda-import
 */

import { getDatabase, closeConnection } from '../src/lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { importDealerDataHandler } from '../src/routes/importDealerData.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import fs from 'fs';
import path from 'path';

// Configuration - UPDATE THESE VALUES
const VEHICLE_ID = process.env.VEHICLE_ID || ''; // Your vehicle's ObjectId
const HONDA_CONTENT_FILE = process.env.HONDA_CONTENT || path.join(__dirname, 'honda-sample.html');

async function testHondaImport() {
  console.log('='.repeat(80));
  console.log('Honda Service History Import Test');
  console.log('='.repeat(80));

  if (!VEHICLE_ID) {
    console.error('❌ VEHICLE_ID environment variable not set');
    console.log('\nUsage: VEHICLE_ID=<your-vehicle-id> npm run test:honda-import');
    process.exit(1);
  }

  if (!ObjectId.isValid(VEHICLE_ID)) {
    console.error('❌ Invalid VEHICLE_ID format:', VEHICLE_ID);
    process.exit(1);
  }

  // Read Honda content file
  let content: string;
  try {
    if (fs.existsSync(HONDA_CONTENT_FILE)) {
      content = fs.readFileSync(HONDA_CONTENT_FILE, 'utf-8');
      console.log(`✓ Loaded content from: ${HONDA_CONTENT_FILE}`);
      console.log(`  Content length: ${content.length} characters`);
    } else {
      console.error(`❌ File not found: ${HONDA_CONTENT_FILE}`);
      console.log('\nCreate a file with pasted Honda HTML and set HONDA_CONTENT environment variable');
      console.log('Example: HONDA_CONTENT=/path/to/honda.html npm run test:honda-import');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error reading file:', error);
    process.exit(1);
  }

  // Verify vehicle exists
  try {
    const db = await getDatabase();
    const vehicle = await db.collection('vehicles').findOne({ _id: new ObjectId(VEHICLE_ID) });
    
    if (!vehicle) {
      console.error(`❌ Vehicle not found: ${VEHICLE_ID}`);
      process.exit(1);
    }

    console.log('✓ Vehicle found:', vehicle.ownership?.nickname || vehicle.identification?.vin);
  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }

  // Create mock API Gateway event
  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: 'POST /vehicles/{id}/import-dealer-data',
    rawPath: `/vehicles/${VEHICLE_ID}/import-dealer-data`,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-west-2.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: `/vehicles/${VEHICLE_ID}/import-dealer-data`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-script',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /vehicles/{id}/import-dealer-data',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    pathParameters: {
      id: VEHICLE_ID,
    },
    body: JSON.stringify({
      source: 'honda',
      dataType: 'service_history',
      content,
    }),
    isBase64Encoded: false,
  };

  console.log('\n' + '-'.repeat(80));
  console.log('Calling import handler...');
  console.log('-'.repeat(80));

  try {
    const response = await importDealerDataHandler(event);
    
    console.log('\nResponse Status:', response.statusCode);
    const body = JSON.parse(response.body);
    
    if (response.statusCode === 200) {
      console.log('✓ Import successful!');
      console.log('\nImported Data:');
      console.log(JSON.stringify(body.importedData, null, 2));

      // Fetch created events
      const db = await getDatabase();
      const events = await db.collection('events')
        .find({ vehicleId: new ObjectId(VEHICLE_ID), source: 'honda_import' })
        .sort({ date: -1 })
        .limit(10)
        .toArray();

      console.log(`\n✓ Found ${events.length} imported Honda service events`);
      console.log('\nRecent Events:');
      events.forEach((event, i) => {
        console.log(`\n${i + 1}. ${event.date?.toLocaleDateString()} - ${event.mileage} miles`);
        console.log(`   ${event.description}`);
        console.log(`   RO#: ${event.repairOrderNumber || 'N/A'}`);
        if (event.details?.services?.length) {
          console.log(`   Services: ${event.details.services.length} items`);
        }
        if (event.details?.parts?.length) {
          console.log(`   Parts: ${event.details.parts.length} items`);
          event.details.parts.slice(0, 3).forEach((part: any) => {
            console.log(`     - ${part.name} (${part.partNumber || 'N/A'})`);
          });
        }
      });
    } else {
      console.error('❌ Import failed');
      console.error('Error:', body.error);
      if (body.details) {
        console.error('Details:', body.details);
      }
    }
  } catch (error) {
    console.error('❌ Exception during import:', error);
    process.exit(1);
  }

  await closeConnection();
  console.log('\n' + '='.repeat(80));
  console.log('Test complete');
  console.log('='.repeat(80));
  process.exit(0);
}

testHondaImport();
