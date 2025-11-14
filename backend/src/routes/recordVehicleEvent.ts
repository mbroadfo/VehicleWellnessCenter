/**
 * recordVehicleEvent Lambda Handler
 * 
 * Creates a new vehicle event record in MongoDB.
 * 
 * Route: POST /vehicles/{vehicleId}/events
 * Auth: JWT (Auth0)
 * 
 * Request body:
 * {
 *   "type": "oil_change",           // Required: event type identifier
 *   "occurredAt": "2025-11-13",     // Required: ISO 8601 date when event happened
 *   "summary": "Oil change at...",  // Required: headline description
 *   "description": "Full details",  // Optional: detailed description
 *   "provider": "Jiffy Lube",       // Optional: service provider
 *   "cost": 45.99,                  // Optional: cost in dollars
 *   "mileage": 45000,               // Optional: odometer reading
 *   "location": { ... },            // Optional: location object
 *   "emoji": "🔧"                   // Optional: display emoji
 * }
 * 
 * Response:
 * - 201: { "eventId": "...", "message": "Event created successfully" }
 * - 400: { "error": "Invalid request: ..." }
 * - 404: { "error": "Vehicle not found" }
 * - 500: { "error": "Internal server error" }
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb';

interface RecordEventRequest {
  type: string;
  occurredAt: string; // ISO 8601 date string
  summary: string;
  description?: string;
  provider?: string;
  cost?: number;
  mileage?: number;
  location?: {
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  emoji?: string;
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // Extract vehicleId from path parameters
    const vehicleId = event.pathParameters?.vehicleId;
    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'vehicleId is required' }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid vehicleId format' }),
      };
    }

    // Parse and validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    let requestBody: RecordEventRequest;
    try {
      requestBody = JSON.parse(event.body) as RecordEventRequest;
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // Validate required fields
    if (!requestBody.type || typeof requestBody.type !== 'string' || requestBody.type.trim() === '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'type is required and must be a non-empty string' }),
      };
    }

    if (!requestBody.occurredAt || typeof requestBody.occurredAt !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'occurredAt is required and must be a date string' }),
      };
    }

    if (!requestBody.summary || typeof requestBody.summary !== 'string' || requestBody.summary.trim() === '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'summary is required and must be a non-empty string' }),
      };
    }

    // Validate and parse occurredAt date
    const occurredAtDate = new Date(requestBody.occurredAt);
    if (isNaN(occurredAtDate.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'occurredAt must be a valid ISO 8601 date' }),
      };
    }

    // Validate optional numeric fields
    if (requestBody.cost !== undefined) {
      if (typeof requestBody.cost !== 'number' || requestBody.cost < 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'cost must be a positive number' }),
        };
      }
    }

    if (requestBody.mileage !== undefined) {
      if (typeof requestBody.mileage !== 'number' || requestBody.mileage < 0 || !Number.isInteger(requestBody.mileage)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'mileage must be a positive integer' }),
        };
      }
    }

    // Connect to MongoDB
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');
    const eventsCollection = db.collection('vehicleEvents');

    // Verify vehicle exists
    const vehicleObjectId = new ObjectId(vehicleId);
    const vehicle = await vehiclesCollection.findOne({ _id: vehicleObjectId });
    
    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Vehicle not found' }),
      };
    }

    // Build event document
    const eventDocument = {
      vehicleId: vehicleObjectId,
      type: requestBody.type.trim(),
      occurredAt: occurredAtDate,
      recordedAt: new Date(),
      summary: requestBody.summary.trim(),
      ...(requestBody.description && { 
        details: { 
          description: requestBody.description 
        } 
      }),
      ...(requestBody.provider && { 
        source: { 
          provider: requestBody.provider 
        } 
      }),
      ...(requestBody.cost !== undefined && { 
        details: { 
          ...(requestBody.description && { description: requestBody.description }),
          cost: requestBody.cost 
        } 
      }),
      ...(requestBody.mileage !== undefined && { 
        details: { 
          ...(requestBody.description && { description: requestBody.description }),
          ...(requestBody.cost !== undefined && { cost: requestBody.cost }),
          mileage: requestBody.mileage 
        } 
      }),
      ...(requestBody.location && { location: requestBody.location }),
      ...(requestBody.emoji && { emoji: requestBody.emoji }),
    };

    // Insert event
    const result = await eventsCollection.insertOne(eventDocument);

    return {
      statusCode: 201,
      body: JSON.stringify({
        eventId: result.insertedId.toString(),
        message: 'Event created successfully',
      }),
    };

  } catch (error) {
    console.error('Error recording vehicle event:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
