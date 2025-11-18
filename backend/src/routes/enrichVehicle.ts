/**
 * Enrich Vehicle Route
 * POST /vehicles/:id/enrich
 * 
 * Decode VIN and update vehicle document with specifications
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb.js';
import { vehicleDataClient, type VehicleSpecs } from '../lib/externalApis.js';
import { getVINValidationError, sanitizeVIN } from '../lib/vinValidator.js';

interface EnrichRequest {
  vin?: string;  // Optional if vehicle already has VIN
}

/**
 * Enrich vehicle with VIN-decoded specifications
 */
export async function enrichVehicleHandler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract vehicle ID from path (API Gateway v2 uses {vehicleId} in route)
    const vehicleId = event.pathParameters?.vehicleId || event.pathParameters?.id;
    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Vehicle ID is required' }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid vehicle ID format' }),
      };
    }

    // Parse request body
    let requestBody: EnrichRequest = {};
    if (event.body) {
      try {
        requestBody = JSON.parse(event.body) as EnrichRequest;
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }
    }

    // Get vehicle from database
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    const vehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(vehicleId),
    });

    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Vehicle not found' }),
      };
    }

    // Determine VIN to use (request body takes precedence)
    let vin = requestBody.vin || vehicle.vin;

    if (!vin) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'VIN is required (provide in request body or vehicle document)',
        }),
      };
    }

    // Sanitize and validate VIN
    vin = sanitizeVIN(vin);
    const validationError = getVINValidationError(vin);
    if (validationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validationError }),
      };
    }

    // Decode VIN using NHTSA vPIC API
    console.log(`[enrichVehicle] Decoding VIN: ${vin}`);
    let specs: VehicleSpecs;
    
    try {
      specs = await vehicleDataClient.decodeVIN(vin);
    } catch (error) {
      console.error('[enrichVehicle] VIN decode failed:', error);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Failed to decode VIN from NHTSA API',
          details: error instanceof Error ? error.message : String(error),
        }),
      };
    }

    // Update vehicle document with specs
    const updateDoc: Record<string, unknown> = {
      specs,
      updatedAt: new Date(),
    };

    // If VIN was provided in request and differs from stored, update it
    if (requestBody.vin && requestBody.vin !== vehicle.vin) {
      updateDoc.vin = vin;
    }

    // Auto-populate year/make/model if not already set
    if (specs.engine.manufacturer && !vehicle.make) {
      // Try to extract make from engine manufacturer or use vPIC data
      // Note: vPIC response includes Make/Model but we're not storing it in specs yet
      // This will be enhanced when we store more vPIC data
    }

    const result = await vehiclesCollection.updateOne(
      { _id: new ObjectId(vehicleId) },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Vehicle not found' }),
      };
    }

    // Fetch updated vehicle
    const updatedVehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(vehicleId),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Vehicle enriched with VIN data',
        vehicle: updatedVehicle,
        specs,
      }),
    };
  } catch (error) {
    console.error('[enrichVehicle] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
