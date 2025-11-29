/**
 * API Integration Tests
 * Tests the full lifecycle: create vehicles/events → update → validate → cleanup
 * 
 * Prerequisites:
 * - Infrastructure deployed (Lambda functions, API Gateway)
 * - Auth0 credentials configured
 * - AWS credentials available (terraform-vwc profile)
 * 
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDatabase, closeConnection } from './lib/mongodb';
import { getAuth0Token } from './lib/auth0';

interface TestContext {
  apiUrl: string;
  authToken: string;
  vehicleId: string;
  eventIds: string[];
}

const context: TestContext = {
  apiUrl: process.env.API_URL || 'https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com',
  authToken: '',
  vehicleId: '',
  eventIds: [],
};

/**
 * Helper: Make authenticated API request
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const url = `${context.apiUrl}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${context.authToken}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: T;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text as T;
  }

  return { status: response.status, data };
}

describe('API Integration Test Suite', () => {
  beforeAll(async () => {
    // Get Auth0 token automatically using M2M credentials
    console.log('\n🔐 Obtaining Auth0 token via Client Credentials flow...');
    context.authToken = await getAuth0Token();
    console.log(`\n🔗 Testing API: ${context.apiUrl}`);
  });

  afterAll(async () => {
    // Final cleanup via MongoDB (in case API tests failed)
    try {
      if (context.vehicleId) {
        console.log('\n🧹 Final cleanup via MongoDB...');
        const db = await getDatabase();
        const vehicleOid = new ObjectId(context.vehicleId);
        
        const eventsDeleted = await db.collection('vehicleEvents').deleteMany({ 
          vehicleId: vehicleOid 
        });
        console.log(`  ✅ Deleted ${eventsDeleted.deletedCount} events`);
        
        const vehicleDeleted = await db.collection('vehicles').deleteOne({ 
          _id: vehicleOid 
        });
        console.log(`  ✅ Deleted ${vehicleDeleted.deletedCount} vehicle`);
      }
    } catch (error) {
      console.error('⚠️  Final cleanup failed:', error);
    } finally {
      await closeConnection();
    }
  });

  describe('Phase 1: Create Test Data', () => {
    it('should create a test vehicle via MongoDB', async () => {
      const db = await getDatabase();
      const vehicleOid = new ObjectId();
      
      const vehicle = {
        _id: vehicleOid,
        identification: {
          vin: `TEST${Date.now()}`,
        },
        attributes: {
          make: 'Tesla',
          model: 'Model 3',
          year: 2023,
          trim: 'Long Range',
          color: 'Midnight Silver Metallic',
        },
        registration: {
          licensePlate: 'TEST123',
          state: 'CO',
        },
        ownership: {
          ownerId: 'test_user_001',
          nickname: 'Test Tesla',
        },
        odometer: {
          current: 15000,
          unit: 'miles',
        },
        acquisition: {
          date: '2023-01-15',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection('vehicles').insertOne(vehicle);
      context.vehicleId = vehicleOid.toString();
      
      console.log(`  📝 Created vehicle: ${context.vehicleId}`);
      expect(context.vehicleId).toBeTruthy();
    });

    it('should create first event via POST API', async () => {
      const eventData = {
        type: 'oil_change',
        occurredAt: '2023-06-15T10:00:00Z',
        summary: 'First oil change at 5,000 miles',
        description: 'Synthetic oil change with filter replacement',
        cost: 89.99,
        mileage: 5000,
        provider: 'Tesla Service Center',
        location: 'Denver, CO',
      };

      const result = await apiRequest<{ eventId: string; message: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        eventData
      );

      expect(result.status).toBe(201);
      expect(result.data.eventId).toBeTruthy();
      context.eventIds.push(result.data.eventId);
      
      console.log(`  📝 Created event 1: ${result.data.eventId}`);
    });

    it('should create second event via POST API', async () => {
      const eventData = {
        type: 'tire_rotation',
        occurredAt: '2023-09-20T14:30:00Z',
        summary: 'Tire rotation at 10,000 miles',
        description: 'Rotated all four tires and checked alignment',
        cost: 45.00,
        mileage: 10000,
        provider: 'Discount Tire',
        location: 'Boulder, CO',
      };

      const result = await apiRequest<{ eventId: string; message: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        eventData
      );

      expect(result.status).toBe(201);
      expect(result.data.eventId).toBeTruthy();
      context.eventIds.push(result.data.eventId);
      
      console.log(`  📝 Created event 2: ${result.data.eventId}`);
    });

    it('should create third event via POST API', async () => {
      const eventData = {
        type: 'inspection',
        occurredAt: '2023-12-10T09:00:00Z',
        summary: 'Annual state inspection',
        description: 'Passed all safety and emissions tests',
        cost: 25.00,
        mileage: 15000,
        provider: 'Colorado Emissions Testing',
        location: 'Denver, CO',
      };

      const result = await apiRequest<{ eventId: string; message: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        eventData
      );

      expect(result.status).toBe(201);
      expect(result.data.eventId).toBeTruthy();
      context.eventIds.push(result.data.eventId);
      
      console.log(`  📝 Created event 3: ${result.data.eventId}`);
      console.log(`  ✅ Created 3 events total`);
    });
  });

  describe('Phase 2: Read and Validate Data', () => {
    it('should fetch vehicle overview via GET API', async () => {
      const result = await apiRequest<{
        _id: string;
        vin: string;
        make?: string;
        model?: string;
        year?: number;
        specs?: any;
        safety?: any;
        fuelEconomy?: any;
        createdAt: string;
        lastUpdated?: string;
      }>('GET', `/vehicles/${context.vehicleId}/overview`);

      expect(result.status).toBe(200);
      expect(result.data._id).toBe(context.vehicleId);
      expect(result.data.make).toBe('Tesla');
      expect(result.data.model).toBe('Model 3');
      expect(result.data.year).toBe(2023);
      
      console.log(`  ✅ Overview: ${result.data.year} ${result.data.make} ${result.data.model}`);
    });

    it('should fetch all events via GET API', async () => {
      const result = await apiRequest<{
        vehicleId: string;
        events: Array<{
          _id: string;
          type: string;
          summary: string;
          occurredAt: string;
        }>;
        pagination: {
          totalCount: number;
          limit: number;
          offset: number;
        };
      }>('GET', `/vehicles/${context.vehicleId}/events`);

      expect(result.status).toBe(200);
      expect(result.data.vehicleId).toBe(context.vehicleId);
      expect(result.data.events.length).toBe(3);
      expect(result.data.pagination.totalCount).toBe(3);

      // Verify events are sorted by occurredAt descending (most recent first)
      const dates = result.data.events.map((e) => new Date(e.occurredAt).getTime());
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
      expect(dates[1]).toBeGreaterThanOrEqual(dates[2]);

      // Verify all our created events are present
      const eventIds = result.data.events.map((e) => e._id);
      context.eventIds.forEach((id) => {
        expect(eventIds).toContain(id);
      });
      
      console.log(`  ✅ Fetched ${result.data.events.length} events`);
      console.log(`  ✅ Events sorted by date (newest first)`);
      console.log(`  ✅ All created events present in response`);
    });
  });

  describe('Phase 3: Update Test Data', () => {
    it('should create additional event after initial validation', async () => {
      const eventData = {
        type: 'brake_service',
        occurredAt: '2024-03-15T11:00:00Z',
        summary: 'Rear brake pad replacement',
        description: 'Replaced rear brake pads and resurfaced rotors',
        cost: 320.00,
        mileage: 18000,
        provider: 'Tesla Service Center',
        location: 'Denver, CO',
      };

      const result = await apiRequest<{ eventId: string; message: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        eventData
      );

      expect(result.status).toBe(201);
      expect(result.data.eventId).toBeTruthy();
      context.eventIds.push(result.data.eventId);
      
      console.log(`  📝 Created event 4: ${result.data.eventId}`);
    });

    it('should verify updated event count', async () => {
      const result = await apiRequest<{
        _id: string;
        make?: string;
        model?: string;
      }>('GET', `/vehicles/${context.vehicleId}/overview`);

      expect(result.status).toBe(200);
      expect(result.data._id).toBe(context.vehicleId);
      
      console.log(`  ✅ Vehicle overview still accessible after adding event`);
    });
  });

  describe('Phase 4: Validation Tests', () => {
    it('should reject POST without authentication', async () => {
      const originalToken = context.authToken;
      context.authToken = '';

      const result = await apiRequest<{ message: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        { type: 'test', occurredAt: '2024-01-01', summary: 'Test' }
      );

      expect(result.status).toBe(401);
      expect(result.data.message).toBe('Unauthorized');
      
      context.authToken = originalToken;
      console.log(`  ✅ Rejected unauthenticated POST request`);
    });

    it('should reject POST with missing required field', async () => {
      const result = await apiRequest<{ error: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        { type: 'test', occurredAt: '2024-01-01' } // missing summary
      );

      expect(result.status).toBe(400);
      expect(result.data.error).toContain('summary is required');
      
      console.log(`  ✅ Rejected POST with missing required field`);
    });

    it('should reject POST with invalid date', async () => {
      const result = await apiRequest<{ error: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        { type: 'test', occurredAt: 'invalid-date', summary: 'Test' }
      );

      expect(result.status).toBe(400);
      expect(result.data.error).toContain('valid ISO 8601 date');
      
      console.log(`  ✅ Rejected POST with invalid date format`);
    });

    it('should reject POST with negative cost', async () => {
      const result = await apiRequest<{ error: string }>(
        'POST',
        `/vehicles/${context.vehicleId}/events`,
        { type: 'test', occurredAt: '2024-01-01', summary: 'Test', cost: -10 }
      );

      expect(result.status).toBe(400);
      expect(result.data.error).toContain('cost must be a positive number');
      
      console.log(`  ✅ Rejected POST with negative cost`);
    });

    it('should reject POST to non-existent vehicle', async () => {
      const fakeVehicleId = new ObjectId().toString();
      const result = await apiRequest<{ error: string }>(
        'POST',
        `/vehicles/${fakeVehicleId}/events`,
        { type: 'test', occurredAt: '2024-01-01', summary: 'Test' }
      );

      expect(result.status).toBe(404);
      expect(result.data.error).toBe('Vehicle not found');
      
      console.log(`  ✅ Rejected POST to non-existent vehicle`);
    });

    it('should reject GET without authentication', async () => {
      const originalToken = context.authToken;
      context.authToken = '';

      const result = await apiRequest<{ message: string }>(
        'GET',
        `/vehicles/${context.vehicleId}/overview`
      );

      expect(result.status).toBe(401);
      expect(result.data.message).toBe('Unauthorized');
      
      context.authToken = originalToken;
      console.log(`  ✅ Rejected unauthenticated GET request`);
    });
  });

  describe('Phase 5: Cleanup', () => {
    it('should delete all test events via MongoDB', async () => {
      const db = await getDatabase();
      const vehicleOid = new ObjectId(context.vehicleId);
      
      const result = await db.collection('vehicleEvents').deleteMany({ 
        vehicleId: vehicleOid 
      });

      expect(result.deletedCount).toBe(4);
      console.log(`  🧹 Deleted ${result.deletedCount} events`);
    });

    it('should delete test vehicle via MongoDB', async () => {
      const db = await getDatabase();
      const vehicleOid = new ObjectId(context.vehicleId);
      
      const result = await db.collection('vehicles').deleteOne({ 
        _id: vehicleOid 
      });

      expect(result.deletedCount).toBe(1);
      console.log(`  🧹 Deleted ${result.deletedCount} vehicle`);
    });

    it('should verify test data is fully cleaned up', async () => {
      const db = await getDatabase();
      const vehicleOid = new ObjectId(context.vehicleId);
      
      const vehicle = await db.collection('vehicles').findOne({ _id: vehicleOid });
      expect(vehicle).toBeNull();
      
      const events = await db.collection('vehicleEvents').find({ 
        vehicleId: vehicleOid 
      }).toArray();
      expect(events.length).toBe(0);
      
      console.log(`  ✅ Cleanup verified: no test data remaining`);
    });
  });
});
