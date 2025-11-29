/**
 * Dealer Portal Import Integration Tests
 * 
 * Tests route logic, validation, and MongoDB updates.
 * Does NOT test Gemini parsing (that would be training to the test).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDatabase, closeConnection } from './lib/mongodb';
import { ObjectId } from 'mongodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { importDealerDataHandler } from './routes/importDealerData';

// Test constants - use unique VIN to avoid conflicts with enrichVehicle and vehicleSafety tests
// VIN: 1C4PJMDX9HW123456 is a valid 2017 Jeep Cherokee VIN (different from other tests)
const TEST_VIN = '1C4PJMDX9HW123456';
const TEST_VEHICLE_NAME = 'Horace-DealerImport'; // Unique suffix to avoid conflicts
let TEST_VEHICLE_ID: string;

describe('Dealer Portal Import Tests', () => {
  beforeAll(async () => {
    // Create test vehicle with unique name to avoid conflicts with other test files
    const db = await getDatabase();
    const collection = db.collection('vehicles');

    // Delete any existing test vehicles with this VIN or name
    await collection.deleteMany({
      $or: [
        { 'identification.vin': TEST_VIN },
        { name: TEST_VEHICLE_NAME }
      ]
    });

    const result = await collection.insertOne({
      identification: {
        vin: TEST_VIN,
      },
      attributes: {
        year: 2017,
        make: 'Jeep',
        model: 'Cherokee',
      },
      ownership: {
        nickname: TEST_VEHICLE_NAME,
      },
      createdAt: new Date(),
    });

    TEST_VEHICLE_ID = result.insertedId.toString();
    console.log(`[Test Setup] Created test vehicle: ${TEST_VEHICLE_ID}`);
  });

  afterAll(async () => {
    const db = await getDatabase();
    const collection = db.collection('vehicles');
    await collection.deleteOne({ _id: new ObjectId(TEST_VEHICLE_ID) });
    
    // Clean up any imported events
    const eventsCollection = db.collection('events');
    await eventsCollection.deleteMany({ vehicleId: new ObjectId(TEST_VEHICLE_ID) });
    
    console.log('[Test Cleanup] Deleted test vehicle and events');
    await closeConnection();
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  it('should return 400 for missing vehicle ID', async () => {
    const event = createMockEvent('POST', '/vehicles//import-dealer-data', {});

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Vehicle ID required');
  });

  it('should return 400 for invalid vehicle ID format', async () => {
    const event = createMockEvent('POST', '/vehicles/invalid-id/import-dealer-data', {
      vehicleId: 'invalid-id',
    });
    event.body = JSON.stringify({
      source: 'mopar',
      dataType: 'dashboard',
      content: '<html>test</html>',
    });

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid vehicle ID format');
  });

  it('should return 404 for non-existent vehicle', async () => {
    const fakeId = new ObjectId().toString();
    const event = createMockEvent('POST', `/vehicles/${fakeId}/import-dealer-data`, {
      vehicleId: fakeId,
    });
    event.body = JSON.stringify({
      source: 'mopar',
      dataType: 'dashboard',
      content: '<html>test</html>',
    });

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Vehicle not found');
  });

  it('should return 400 for missing request body', async () => {
    const event = createMockEvent('POST', `/vehicles/${TEST_VEHICLE_ID}/import-dealer-data`, {
      vehicleId: TEST_VEHICLE_ID,
    });
    // No body

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Request body required');
  });

  it('should return 400 for invalid JSON body', async () => {
    const event = createMockEvent('POST', `/vehicles/${TEST_VEHICLE_ID}/import-dealer-data`, {
      vehicleId: TEST_VEHICLE_ID,
    });
    event.body = 'not json';

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid JSON');
  });

  it('should return 400 for missing required fields', async () => {
    const event = createMockEvent('POST', `/vehicles/${TEST_VEHICLE_ID}/import-dealer-data`, {
      vehicleId: TEST_VEHICLE_ID,
    });
    event.body = JSON.stringify({
      source: 'mopar',
      // Missing dataType and content
    });

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Missing required fields');
  });

  it('should return 400 for unsupported source', async () => {
    const event = createMockEvent('POST', `/vehicles/${TEST_VEHICLE_ID}/import-dealer-data`, {
      vehicleId: TEST_VEHICLE_ID,
    });
    event.body = JSON.stringify({
      source: 'tesla', // Not supported
      dataType: 'dashboard',
      content: '<html>test</html>',
    });

    const response = await importDealerDataHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('not yet supported');
  });

  // ============================================================================
  // Real Import Test (Manual/Optional)
  // ============================================================================

  it(
    'should import real Mopar dashboard data',
    async () => {
      const event = createMockEvent('POST', `/vehicles/${TEST_VEHICLE_ID}/import-dealer-data`, {
        vehicleId: TEST_VEHICLE_ID,
      });
      
      event.body = JSON.stringify({
        source: 'mopar',
        dataType: 'dashboard',
        content: `
Horace
Vin: 1C4PJMDX9HW123456

Mileage: 3,560 miles
My Garage
There is only one vehicle present at the moment.
Please add another vehicle
+ ADD ANOTHER VEHICLE
Find Dealer
Safety Recalls
Incomplete: 1
Complete: 1
What is a Safety Recall?
Last Updated: November 12, 2025
View all
Alerts
Your vehicle has one or more recalls.
View Details
Your Uconnect Access subscription has expired.
Renew Now
View All
Subscriptions
Connected Services
Uconnect®
Status: Expired
Renew Now
Coverage Plans
MOPAR TIRE WORKS
Start Date
05/29/2024
Expiration Date
05/29/2026
Deductible Per Repair
0.00
Contract Number
53769698
Your Vehicle's Warranty Coverage
Basic Limited Warranty
Expiration Date
09/23/2020
Expiration Mileage
36,000 miles
Your Basic Limited Warranty has expired. Click below to explore additional coverage plans.
        `,
      });

      const response = await importDealerDataHandler(event);

      console.log('[Test] Response status:', response.statusCode);
      console.log('[Test] Response body:', response.body);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.importedData).toBeDefined();

      console.log('[Test] Imported data:', body.importedData);

      // Verify MongoDB was updated
      const db = await getDatabase();
      const collection = db.collection('vehicles');
      const vehicle = await collection.findOne({ _id: new ObjectId(TEST_VEHICLE_ID) });

      console.log('[Test] Vehicle found:', vehicle?._id?.toString());
      console.log('[Test] Dealer portal data:', vehicle?.dealerPortal);

      if (!vehicle) {
        throw new Error(`Test vehicle ${TEST_VEHICLE_ID} not found in database`);
      }

      expect(vehicle.dealerPortal).toBeDefined();
      expect(vehicle.dealerPortal.source).toBe('mopar');
      expect(vehicle.dealerPortal.lastSync).toBeDefined();
    },
    60000 // 60 second timeout for Gemini API
  );
});

// ============================================================================
// Test Utilities
// ============================================================================

function createMockEvent(
  method: string,
  path: string,
  pathParameters: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer mock-jwt-token',
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-west-2.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'test-request-id',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    pathParameters,
    isBase64Encoded: false,
  };
}
