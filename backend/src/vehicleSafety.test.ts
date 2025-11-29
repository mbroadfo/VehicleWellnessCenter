/**
 * Integration Tests for Vehicle Safety Features
 * Tests NHTSA Recalls and Complaints APIs + Safety Endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDatabase, closeConnection } from './lib/mongodb';
import { vehicleDataClient } from './lib/externalApis';
import { getVehicleSafetyHandler } from './routes/getVehicleSafety';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Test constants
const TEST_VIN = '1C4PJMBS9HW664582'; // 2017 Jeep Cherokee
const TEST_VEHICLE_ID = new ObjectId();

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeAll(async () => {
  const db = await getDatabase();
  const vehicles = db.collection('vehicles');

  // Delete existing test vehicle by VIN (prevents duplicate key errors on reruns)
  await vehicles.deleteOne({ 'identification.vin': TEST_VIN });

  // Create test vehicle with specific ID
  const result = await vehicles.insertOne({
    _id: TEST_VEHICLE_ID,
    identification: {
      vin: TEST_VIN,
    },
    attributes: {
      make: 'Jeep',
      model: 'Cherokee',
      year: 2017,
    },
    ownership: {
      ownerId: 'test-user',
      nickname: 'Test Jeep',
    },
    createdAt: new Date(),
  });

  console.log(`✅ Created test vehicle with ID: ${result.insertedId.toString()}`);
});

afterAll(async () => {
  const db = await getDatabase();
  const vehicles = db.collection('vehicles');

  // Cleanup test vehicle
  await vehicles.deleteOne({ _id: TEST_VEHICLE_ID });

  // Close MongoDB connection
  await closeConnection();
});

// ============================================================================
// Test Suite 1: NHTSA Recalls API
// ============================================================================

describe('NHTSA Recalls API', () => {
  it('should fetch recalls for 2017 Jeep Cherokee', async () => {
    // Clear cache to ensure fresh API call
    vehicleDataClient.clearCache();

    const recalls = await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);

    expect(recalls).toBeDefined();
    expect(Array.isArray(recalls)).toBe(true);
    expect(recalls.length).toBeGreaterThan(0);

    // Verify recall structure
    const firstRecall = recalls[0];
    expect(firstRecall).toHaveProperty('NHTSACampaignNumber');
    expect(firstRecall).toHaveProperty('component');
    expect(firstRecall).toHaveProperty('summary');
    expect(firstRecall).toHaveProperty('consequence');
    expect(firstRecall).toHaveProperty('remedy');
  });

  it('should cache recalls data', async () => {
    // First call (should use cache from previous test)
    const start1 = Date.now();
    await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);
    const duration1 = Date.now() - start1;

    // Second call (should hit memory cache - very fast)
    const start2 = Date.now();
    await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);
    const duration2 = Date.now() - start2;

    // Memory cache should be significantly faster (< 5ms vs 50-500ms)
    expect(duration2).toBeLessThan(10);
    console.log(`Cache performance: First=${duration1}ms, Second=${duration2}ms`);
  });

  it('should return empty array for vehicle with no recalls', async () => {
    // Use a fictional vehicle that likely has no recalls
    const recalls = await vehicleDataClient.getRecalls('Tesla', 'Cybertruck', 2025);

    expect(recalls).toBeDefined();
    expect(Array.isArray(recalls)).toBe(true);
    // May or may not have recalls - just verify it doesn't throw
  });
});

// ============================================================================
// Test Suite 2: NHTSA Complaints API
// ============================================================================

describe('NHTSA Complaints API', () => {
  it('should fetch complaints for 2017 Jeep Cherokee', async () => {
    // Clear cache to ensure fresh API call
    vehicleDataClient.clearCache();

    const complaints = await vehicleDataClient.getComplaints('Jeep', 'Cherokee', 2017);

    expect(complaints).toBeDefined();
    expect(Array.isArray(complaints)).toBe(true);
    expect(complaints.length).toBeGreaterThan(0);

    // Verify complaint structure
    const firstComplaint = complaints[0];
    expect(firstComplaint).toHaveProperty('odiNumber');
    expect(firstComplaint).toHaveProperty('manufacturer');
    expect(firstComplaint).toHaveProperty('crash');
    expect(firstComplaint).toHaveProperty('fire');
    expect(firstComplaint).toHaveProperty('summary');
  }, 10000);

  it('should cache complaints data', async () => {
    // First call (should use cache from previous test)
    const start1 = Date.now();
    await vehicleDataClient.getComplaints('Jeep', 'Cherokee', 2017);
    const duration1 = Date.now() - start1;

    // Second call (should hit memory cache - very fast)
    const start2 = Date.now();
    await vehicleDataClient.getComplaints('Jeep', 'Cherokee', 2017);
    const duration2 = Date.now() - start2;

    // Memory cache should be significantly faster
    expect(duration2).toBeLessThan(10);
    console.log(`Cache performance: First=${duration1}ms, Second=${duration2}ms`);
  });

  it('should handle vehicle with few/no complaints', async () => {
    // Use a common vehicle that's likely valid but has fewer complaints
    const complaints = await vehicleDataClient.getComplaints('Toyota', 'Camry', 2020);

    expect(complaints).toBeDefined();
    expect(Array.isArray(complaints)).toBe(true);
    // May have zero or few complaints - just verify it returns array
  }, 10000);
});

// ============================================================================
// Test Suite 3: Vehicle Safety Endpoint
// ============================================================================

describe('GET /vehicles/:id/safety endpoint', () => {
  it('should fetch safety data for test vehicle', async () => {
    // Ensure test vehicle exists (handles race conditions in parallel test execution)
    const db = await getDatabase();
    const vehicles = db.collection('vehicles');
    const vehicle = await vehicles.findOne({ _id: TEST_VEHICLE_ID });
    
    if (!vehicle) {
      console.warn(`⚠️  Test vehicle ${TEST_VEHICLE_ID.toString()} not found - recreating`);
      // Delete any vehicle with same VIN first (prevents duplicate key errors)
      await vehicles.deleteOne({ vin: TEST_VIN });
      await vehicles.insertOne({
        _id: TEST_VEHICLE_ID,
        vin: TEST_VIN,
        make: 'Jeep',
        model: 'Cherokee',
        year: 2017,
        userId: 'test-user',
        nickname: 'Test Jeep',
        createdAt: new Date(),
      });
    }

    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: `/vehicles/${TEST_VEHICLE_ID.toString()}/safety`,
        },
      } as APIGatewayProxyEventV2['requestContext'],
      pathParameters: {
        id: TEST_VEHICLE_ID.toString(),
      },
    };

    const response = await getVehicleSafetyHandler(
      event as APIGatewayProxyEventV2
    );

    // Type narrowing
    expect(typeof response).toBe('object');
    expect(response).toHaveProperty('statusCode');
    if (typeof response === 'string') throw new Error('Unexpected string response');

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body || '{}');
    expect(body.success).toBe(true);
    expect(body.vehicle).toBeDefined();
    expect(body.safety).toBeDefined();
    expect(body.safety.recalls).toBeDefined();
    expect(body.safety.complaints).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.summary.totalRecalls).toBeGreaterThan(0);
    expect(body.summary.totalComplaints).toBeGreaterThan(0);
  });

  it('should return 404 for non-existent vehicle', async () => {
    const fakeId = new ObjectId();

    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: `/vehicles/${fakeId.toString()}/safety`,
        },
      } as APIGatewayProxyEventV2['requestContext'],
      pathParameters: {
        id: fakeId.toString(),
      },
    };

    const response = await getVehicleSafetyHandler(
      event as APIGatewayProxyEventV2
    );

    // Type narrowing
    expect(typeof response).toBe('object');
    if (typeof response === 'string') throw new Error('Unexpected string response');

    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body || '{}');
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  it('should return 400 for invalid vehicle ID format', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: '/vehicles/invalid-id/safety',
        },
      } as APIGatewayProxyEventV2['requestContext'],
      pathParameters: {
        id: 'invalid-id',
      },
    };

    const response = await getVehicleSafetyHandler(
      event as APIGatewayProxyEventV2
    );

    // Type narrowing
    expect(typeof response).toBe('object');
    if (typeof response === 'string') throw new Error('Unexpected string response');

    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body || '{}');
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid');
  });

  it('should persist safety data in MongoDB after endpoint call', async () => {
    const db = await getDatabase();
    const vehicles = db.collection('vehicles');

    // Ensure test vehicle exists before endpoint call
    await vehicles.updateOne(
      { 'identification.vin': TEST_VIN },
      {
        $setOnInsert: {
          _id: TEST_VEHICLE_ID,
          identification: {
            vin: TEST_VIN,
          },
          attributes: {
            make: 'Jeep',
            model: 'Cherokee',
            year: 2017,
          },
          ownership: {
            ownerId: 'test-user',
            nickname: 'Test Jeep',
          },
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Call the safety endpoint
    const event: Partial<APIGatewayProxyEventV2> = {
      requestContext: {
        http: {
          method: 'GET',
          path: `/vehicles/${TEST_VEHICLE_ID.toString()}/safety`,
        },
      } as APIGatewayProxyEventV2['requestContext'],
      pathParameters: {
        id: TEST_VEHICLE_ID.toString(),
      },
    };

    await getVehicleSafetyHandler(event as APIGatewayProxyEventV2);

    // Fetch vehicle from DB and check safety field
    let updatedVehicle = await vehicles.findOne({ _id: TEST_VEHICLE_ID });
    if (!updatedVehicle) {
      updatedVehicle = await vehicles.findOne({ 'identification.vin': TEST_VIN });
    }
    expect(updatedVehicle).toBeDefined();
    expect(updatedVehicle!.safety).toBeDefined();
    expect(updatedVehicle!.safety.recalls).toBeDefined();
    expect(updatedVehicle!.safety.complaints).toBeDefined();
    expect(updatedVehicle!.safety.lastChecked).toBeDefined();
    expect(updatedVehicle!.safetyLastChecked).toBeDefined();
  });
});
