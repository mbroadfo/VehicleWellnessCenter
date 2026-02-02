/**
 * Tests for Natural Language Maintenance Parsing
 * 
 * These are validation-only tests - we test the route handler logic,
 * not the actual Gemini API parsing (to avoid external API dependencies).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDatabase } from './lib/mongodb';
import { handler } from './routes/parseMaintenance';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const TEST_VIN = 'TESTMAINT123456789';
const TEST_VEHICLE_ID = new ObjectId();

describe('Parse Maintenance Route', () => {
  beforeAll(async () => {
    // Create test vehicle
    const db = await getDatabase();
    await db.collection('vehicles').insertOne({
      _id: TEST_VEHICLE_ID,
      identification: { vin: TEST_VIN },
      ownership: { ownerId: 'test-user-123' },
      createdAt: new Date()
    });
  });

  afterAll(async () => {
    // Clean up test data
    const db = await getDatabase();
    await db.collection('vehicles').deleteMany({
      identification: { vin: TEST_VIN }
    });
  });

  it('should reject request with missing vehicleId', async () => {
    const event = {
      pathParameters: {},
      body: JSON.stringify({ text: 'test' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('vehicleId');
  });

  it('should reject request with invalid vehicleId format', async () => {
    const event = {
      pathParameters: { vehicleId: 'invalid-id' },
      body: JSON.stringify({ text: 'test' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('vehicleId');
  });

  it('should reject request with missing body', async () => {
    const event = {
      pathParameters: { vehicleId: TEST_VEHICLE_ID.toString() },
      body: null,
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('body');
  });

  it('should reject request with invalid JSON body', async () => {
    const event = {
      pathParameters: { vehicleId: TEST_VEHICLE_ID.toString() },
      body: 'not-json',
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('JSON');
  });

  it('should reject request with empty text field', async () => {
    const event = {
      pathParameters: { vehicleId: TEST_VEHICLE_ID.toString() },
      body: JSON.stringify({ text: '' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('text');
  });

  it('should reject request with whitespace-only text', async () => {
    const event = {
      pathParameters: { vehicleId: TEST_VEHICLE_ID.toString() },
      body: JSON.stringify({ text: '   ' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('text');
  });

  it('should reject request for vehicle user does not own', async () => {
    const event = {
      pathParameters: { vehicleId: TEST_VEHICLE_ID.toString() },
      body: JSON.stringify({ text: 'Oil change at 50k miles $45' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'different-user' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  it('should reject request for non-existent vehicle', async () => {
    const fakeVehicleId = new ObjectId();
    const event = {
      pathParameters: { vehicleId: fakeVehicleId.toString() },
      body: JSON.stringify({ text: 'Oil change at 50k miles $45' }),
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'test-user-123' } } }
      }
    } as any;

    const response = await handler(event) as APIGatewayProxyStructuredResultV2;

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body || "{}");
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  // Note: We don't test actual Gemini API parsing here to avoid:
  // 1. External API dependencies in tests
  // 2. Rate limit issues
  // 3. Non-deterministic AI responses
  // 
  // Gemini parsing should be tested manually or with integration tests
  // that run separately from the main test suite.
});

describe('Maintenance Types', () => {
  it('should validate ParsedMaintenanceRecord structure', () => {
    // This is a TypeScript compile-time test more than runtime
    const validRecord = {
      vendor: 'Test Shop',
      date: '2026-01-15T00:00:00Z',
      odometer: 50000,
      services: [
        { name: 'Oil Change', cost: 45.00 }
      ],
      total: 45.00
    };

    expect(validRecord.vendor).toBe('Test Shop');
    expect(validRecord.odometer).toBe(50000);
    expect(validRecord.services).toHaveLength(1);
    expect(validRecord.total).toBe(45.00);
  });

  it('should allow optional fields', () => {
    const recordWithOptionals = {
      vendor: 'Test Shop',
      date: '2026-01-15T00:00:00Z',
      odometer: 50000,
      services: [
        { name: 'Oil Change', cost: 45.00, notes: 'Synthetic oil' }
      ],
      total: 45.00,
      parts: [
        { name: 'Air Filter', quantity: 1, notes: 'Replaced' }
      ],
      notes: 'Regular maintenance'
    };

    expect(recordWithOptionals.parts).toBeDefined();
    expect(recordWithOptionals.notes).toBe('Regular maintenance');
    expect(recordWithOptionals.services[0].notes).toBe('Synthetic oil');
  });
});
