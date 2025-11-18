/**
 * Integration tests for VIN enrichment
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { getDatabase } from './lib/mongodb';
import { vehicleDataClient } from './lib/externalApis';
import { isValidVIN, sanitizeVIN, getVINValidationError } from './lib/vinValidator';

// Test VIN - 2017 Jeep Cherokee
const TEST_VIN = '1C4PJMBS9HW664582';

describe('VIN Validator', () => {
  it('should validate a correct VIN', () => {
    expect(isValidVIN(TEST_VIN)).toBe(true);
  });

  it('should reject VIN with invalid length', () => {
    const shortVin = '1FTFW1ET7BFA513';
    expect(isValidVIN(shortVin)).toBe(false);
  });

  it('should reject VIN with invalid characters (I, O, Q)', () => {
    const invalidVin = '1FTFW1ET7BFA5137I'; // Contains 'I'
    expect(isValidVIN(invalidVin)).toBe(false);
  });

  it('should reject VIN with invalid check digit', () => {
    const invalidVin = '1FTFW1ET7BFA51375'; // Wrong check digit (should be 6)
    expect(isValidVIN(invalidVin)).toBe(false);
  });

  it('should sanitize VIN (remove spaces and hyphens)', () => {
    const messyVin = '1FTFW1ET7-BFA-51376';
    const cleaned = sanitizeVIN(messyVin);
    expect(cleaned).toBe('1FTFW1ET7BFA51376');
  });

  it('should provide detailed validation error messages', () => {
    expect(getVINValidationError('')).toBe('VIN is required');
    expect(getVINValidationError('TOO-SHORT')).toBe('VIN must be exactly 17 characters (got 8)');
    expect(getVINValidationError('1FTFW1ET7BFA5137I')).toBe('VIN cannot contain the letters I, O, or Q');
    expect(getVINValidationError('1FTFW1ET7BFA51375')).toBe('Invalid VIN check digit');
    expect(getVINValidationError(TEST_VIN)).toBe(null); // Valid
  });
});

describe('NHTSA vPIC API Client', () => {
  it('should decode a valid VIN', async () => {
    const specs = await vehicleDataClient.decodeVIN(TEST_VIN);

    expect(specs).toBeDefined();
    expect(specs.source).toBe('NHTSA_vPIC');
    expect(specs.engine).toBeDefined();
    expect(specs.body).toBeDefined();
    expect(specs.decodedAt).toBeInstanceOf(Date);
    
    // Verify some basic fields
    expect(specs.engine.cylinders).toBeGreaterThan(0);
    expect(specs.body.type).toBeDefined();
    expect(specs.body.type).not.toBe('Unknown');
  }, 15000); // Allow 15s for API call (external API can be slow)

  it('should handle invalid VIN gracefully', async () => {
    const invalidVin = '00000000000000000'; // Valid format but invalid data
    
    await expect(async () => {
      await vehicleDataClient.decodeVIN(invalidVin);
    }).rejects.toThrow();
  });

  it('should cache VIN decode results', async () => {
    // Clear memory cache to ensure fresh API call
    const { memoryCache } = await import('./lib/cache.js');
    memoryCache.clear();
    
    // First call - should hit API
    const start1 = Date.now();
    const specs1 = await vehicleDataClient.decodeVIN(TEST_VIN);
    const duration1 = Date.now() - start1;

    // Second call - should hit memory cache
    const start2 = Date.now();
    const specs2 = await vehicleDataClient.decodeVIN(TEST_VIN);
    const duration2 = Date.now() - start2;

    // Verify results are identical
    expect(specs2.engine.cylinders).toBe(specs1.engine.cylinders);
    expect(specs2.body.type).toBe(specs1.body.type);

    console.log(`Cache performance: API=${duration1}ms, Memory=${duration2}ms`);

    // Second call should be significantly faster (cache hit)
    expect(duration2).toBeLessThan(duration1 / 10); // At least 10x faster
    expect(duration2).toBeLessThan(10); // Sub-10ms for memory cache
  }, 15000);
});

describe('Enrich Vehicle Endpoint', () => {
  let testVehicleId: ObjectId;

  beforeAll(async () => {
    // Create a test vehicle (delete existing first to avoid duplicate VIN)
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    // Clean up any existing test vehicle with same VIN
    await vehiclesCollection.deleteOne({ vin: TEST_VIN });

    const result = await vehiclesCollection.insertOne({
      name: 'Test Vehicle for VIN Enrichment',
      vin: TEST_VIN,
      year: 2017,
      make: 'Jeep',
      model: 'Cherokee',
      acquiredAt: new Date(),
      ownerId: 'test-user'
    });

    testVehicleId = result.insertedId;
  });

  it('should enrich vehicle with VIN specs', async () => {
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    // Get the vehicle
    const vehicle = await vehiclesCollection.findOne({ _id: testVehicleId });
    expect(vehicle).toBeDefined();
    expect(vehicle!.vin).toBe(TEST_VIN);

    // Decode VIN
    const specs = await vehicleDataClient.decodeVIN(vehicle!.vin);
  expect(specs).toBeDefined();
  expect(specs.engine).toBeDefined();
  expect(specs.body).toBeDefined();

    // Update vehicle with specs
    await vehiclesCollection.updateOne(
      { _id: testVehicleId },
      { $set: { specs, updatedAt: new Date() } }
    );

    // Verify update
    const enrichedVehicle = await vehiclesCollection.findOne({ _id: testVehicleId });
    expect(enrichedVehicle!.specs).toBeDefined();
    expect(enrichedVehicle!.specs.engine.cylinders).toBeGreaterThan(0);
    expect(enrichedVehicle!.specs.body.type).toBeDefined();
    expect(enrichedVehicle!.specs.source).toBe('NHTSA_vPIC');
  }, 10000);

  it('should validate VIN before enrichment', async () => {
    const invalidVin = 'INVALID-VIN-123';
    const error = getVINValidationError(invalidVin);
    
    expect(error).not.toBe(null);
    expect(error).toContain('17 characters');
  });
});
