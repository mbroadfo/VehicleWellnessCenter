/**
 * Tests for recordVehicleEvent Lambda handler
 * Validation-only tests - no MongoDB mocking.
 */

import { describe, it, expect } from 'vitest';
import { handler } from './routes/recordVehicleEvent';

describe('recordVehicleEvent', () => {
  it('returns 400 when vehicleId is missing', async () => {
    const event = {
      body: JSON.stringify({ type: 'oil_change', occurredAt: '2025-11-13', summary: 'Test' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'vehicleId is required' });
  });

  it('returns 400 when vehicleId is invalid ObjectId', async () => {
    const event = {
      pathParameters: { vehicleId: 'invalid' },
      body: JSON.stringify({ type: 'oil_change', occurredAt: '2025-11-13', summary: 'Test' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid vehicleId format' });
  });

  it('returns 400 when body is missing', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Request body is required' });
  });

  it('returns 400 when type is missing', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ occurredAt: '2025-11-13', summary: 'Test' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'type is required and must be a non-empty string' 
    });
  });

  it('returns 400 when occurredAt is missing', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ type: 'oil_change', summary: 'Test' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'occurredAt is required and must be a date string' 
    });
  });

  it('returns 400 when occurredAt is invalid date', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ type: 'oil_change', occurredAt: 'invalid', summary: 'Test' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'occurredAt must be a valid ISO 8601 date' 
    });
  });

  it('returns 400 when summary is missing', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ type: 'oil_change', occurredAt: '2025-11-13' }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'summary is required and must be a non-empty string' 
    });
  });

  it('returns 400 when cost is negative', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ 
        type: 'oil_change', 
        occurredAt: '2025-11-13', 
        summary: 'Test', 
        cost: -10 
      }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'cost must be a positive number' 
    });
  });

  it('returns 400 when mileage is not integer', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      body: JSON.stringify({ 
        type: 'oil_change', 
        occurredAt: '2025-11-13', 
        summary: 'Test', 
        mileage: 45000.5 
      }),
    } as any;

    const result: any = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ 
      error: 'mileage must be a positive integer' 
    });
  });
});
