/**
 * Unit tests for listVehicleEvents Lambda handler
 * Note: Only testing input validation - full integration tested via deployment
 */

import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from './listVehicleEvents';

describe('listVehicleEvents - Input Validation', () => {
  it('should return 400 if vehicleId is missing', async () => {
    const event = {
      pathParameters: null,
    } as unknown as APIGatewayProxyEvent;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing vehicleId parameter',
    });
  });

  it('should return 400 if vehicleId is invalid ObjectId', async () => {
    const event = {
      pathParameters: { vehicleId: 'invalid-id' },
      queryStringParameters: null,
    } as unknown as APIGatewayProxyEvent;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid vehicleId format',
    });
  });

  it('should return 400 if limit is invalid', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      queryStringParameters: { limit: 'abc' },
    } as unknown as APIGatewayProxyEvent;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid limit parameter',
    });
  });

  it('should return 400 if offset is invalid', async () => {
    const event = {
      pathParameters: { vehicleId: '507f1f77bcf86cd799439011' },
      queryStringParameters: { offset: '-5' },
    } as unknown as APIGatewayProxyEvent;

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid offset parameter',
    });
  });
});
