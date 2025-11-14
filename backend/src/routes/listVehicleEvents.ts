/**
 * Lambda handler: List vehicle events with pagination and filtering
 * Route: GET /vehicles/{vehicleId}/events
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb';

interface QueryParams {
  limit?: string;
  offset?: string;
  type?: string;
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract and validate vehicleId
    const vehicleId = event.pathParameters?.vehicleId;
    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing vehicleId parameter' }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid vehicleId format' }),
      };
    }

    // Parse query parameters
    const queryParams = (event.queryStringParameters || {}) as QueryParams;
    const limit = Math.min(parseInt(queryParams.limit || '10', 10), 100); // Max 100
    const offset = parseInt(queryParams.offset || '0', 10);
    const eventType = queryParams.type;

    // Validate pagination params
    if (isNaN(limit) || limit < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid limit parameter' }),
      };
    }
    if (isNaN(offset) || offset < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid offset parameter' }),
      };
    }

    // Connect to MongoDB
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');
    const eventsCollection = db.collection('vehicleEvents');

    // Check if vehicle exists
    const vehicleObjectId = new ObjectId(vehicleId);
    const vehicle = await vehiclesCollection.findOne({ _id: vehicleObjectId });
    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Vehicle not found' }),
      };
    }

    // Build query filter
    const filter: { vehicleId: ObjectId; type?: string } = {
      vehicleId: vehicleObjectId,
    };
    if (eventType) {
      filter.type = eventType;
    }

    // Get total count for pagination metadata
    const totalCount = await eventsCollection.countDocuments(filter);

    // Query events with pagination and sorting
    const events = await eventsCollection
      .find(filter)
      .sort({ occurredAt: -1 }) // Most recent first
      .skip(offset)
      .limit(limit)
      .toArray();

    // Calculate pagination metadata
    const hasMore = offset + limit < totalCount;
    const nextOffset = hasMore ? offset + limit : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        vehicleId,
        events,
        pagination: {
          limit,
          offset,
          totalCount,
          hasMore,
          nextOffset,
        },
      }),
    };
  } catch (error) {
    console.error('Error listing vehicle events:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
