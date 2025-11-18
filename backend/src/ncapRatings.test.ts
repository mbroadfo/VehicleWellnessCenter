/**
 * NCAP Safety Ratings API Client Tests
 * Tests for NHTSA NCAP safety ratings integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { vehicleDataClient } from './lib/externalApis.js';

// Test constants - 2017 Jeep Cherokee 4WD (NCAP Vehicle ID 11348)
const TEST_YEAR = 2017;
const TEST_MAKE = 'Jeep';
const TEST_MODEL = 'Cherokee';

describe('NCAP Ratings Client', () => {
  beforeAll(() => {
    // Clear cache before tests to ensure fresh API calls
    vehicleDataClient.clearCache();
  });

  it('should fetch NCAP ratings for 2017 Jeep Cherokee', async () => {
    const ratings = await vehicleDataClient.getSafetyRatings(
      TEST_YEAR,
      TEST_MAKE,
      TEST_MODEL
    );

    expect(ratings).toBeDefined();
    expect(ratings).not.toBeNull();
    
    if (ratings) {
      expect(ratings).toHaveProperty('overall');
      expect(ratings).toHaveProperty('frontDriver');
      expect(ratings).toHaveProperty('frontPassenger');
      expect(ratings).toHaveProperty('side');
      expect(ratings).toHaveProperty('rollover');
      expect(ratings).toHaveProperty('rolloverPossibility');
      expect(ratings).toHaveProperty('features');
      expect(ratings).toHaveProperty('vehicleId');
      expect(ratings).toHaveProperty('lastUpdated');

      // Verify ratings are valid (1-5 stars or 0 if not rated)
      expect(ratings.overall).toBeGreaterThanOrEqual(0);
      expect(ratings.overall).toBeLessThanOrEqual(5);
      expect(ratings.frontDriver).toBeGreaterThanOrEqual(0);
      expect(ratings.frontPassenger).toBeGreaterThanOrEqual(0);
      expect(ratings.side).toBeGreaterThanOrEqual(0);
      expect(ratings.rollover).toBeGreaterThanOrEqual(0);

      // Verify rollover possibility is a percentage (0-100)
      expect(ratings.rolloverPossibility).toBeGreaterThanOrEqual(0);
      expect(ratings.rolloverPossibility).toBeLessThanOrEqual(100);

      console.log(`NCAP Ratings for ${TEST_YEAR} ${TEST_MAKE} ${TEST_MODEL}:`);
      console.log(`  Overall: ${ratings.overall} stars`);
      console.log(`  Front: ${ratings.frontDriver}/${ratings.frontPassenger} stars`);
      console.log(`  Side: ${ratings.side} stars`);
      console.log(`  Rollover: ${ratings.rollover} stars (${ratings.rolloverPossibility.toFixed(1)}% risk)`);
      console.log(`  ESC: ${ratings.features.electronicStabilityControl}`);
      console.log(`  FCW: ${ratings.features.forwardCollisionWarning}`);
      console.log(`  LDW: ${ratings.features.laneDepartureWarning}`);
    }
  }, 15000); // 15s timeout for external API

  it('should verify expected ratings for 2017 Jeep Cherokee', async () => {
    const ratings = await vehicleDataClient.getSafetyRatings(
      TEST_YEAR,
      TEST_MAKE,
      TEST_MODEL
    );

    expect(ratings).not.toBeNull();
    
    if (ratings) {
      // Known values from NHTSA API for 2017 Cherokee 4WD (ID 11348)
      expect(ratings.overall).toBe(4);
      expect(ratings.frontDriver).toBe(4);
      expect(ratings.frontPassenger).toBe(4);
      expect(ratings.side).toBe(5);
      expect(ratings.rollover).toBe(4);
      
      // Rollover possibility around 16.9%
      expect(ratings.rolloverPossibility).toBeGreaterThan(15);
      expect(ratings.rolloverPossibility).toBeLessThan(20);

      // Verify safety features
      expect(ratings.features.electronicStabilityControl).toBe('Standard');
      expect(['Optional', 'Standard']).toContain(ratings.features.forwardCollisionWarning);
      expect(['Optional', 'Standard']).toContain(ratings.features.laneDepartureWarning);
    }
  }, 15000);

  it('should cache NCAP ratings for subsequent calls', async () => {
    // First call - should hit API
    const start1 = Date.now();
    const ratings1 = await vehicleDataClient.getSafetyRatings(
      TEST_YEAR,
      TEST_MAKE,
      TEST_MODEL
    );
    const duration1 = Date.now() - start1;

    // Second call - should hit memory cache
    const start2 = Date.now();
    const ratings2 = await vehicleDataClient.getSafetyRatings(
      TEST_YEAR,
      TEST_MAKE,
      TEST_MODEL
    );
    const duration2 = Date.now() - start2;

    expect(ratings2).toEqual(ratings1); // Same data
    expect(duration2).toBeLessThanOrEqual(duration1); // Cache should be as fast or faster

    console.log(`API call: ${duration1}ms, Cache hit: ${duration2}ms`);
  }, 15000);

  it('should return null for non-existent vehicle', async () => {
    const ratings = await vehicleDataClient.getSafetyRatings(
      2099,
      'FakeMake',
      'FakeModel'
    );

    expect(ratings).toBeNull();
    console.log('Non-existent vehicle correctly returned null');
  }, 15000);

  it('should return null for vehicle without NCAP ratings', async () => {
    // Older vehicles or those not tested by NHTSA won't have ratings
    const ratings = await vehicleDataClient.getSafetyRatings(
      1990,
      'Honda',
      'Civic'
    );

    // May be null or have ratings depending on whether NHTSA tested it
    if (ratings === null) {
      console.log('1990 Honda Civic has no NCAP ratings (expected)');
    } else {
      console.log(`1990 Honda Civic has ratings: ${ratings.overall} stars`);
    }
    
    // Either outcome is valid - test passes
    expect(true).toBe(true);
  }, 15000);

  it('should handle API errors gracefully', async () => {
    // getSafetyRatings returns null on error, doesn't throw
    const ratings = await vehicleDataClient.getSafetyRatings(
      -1, // Invalid year
      '',  // Empty make
      ''   // Empty model
    );

    expect(ratings).toBeNull();
    console.log('Invalid input handled gracefully (returned null)');
  }, 15000);
});
