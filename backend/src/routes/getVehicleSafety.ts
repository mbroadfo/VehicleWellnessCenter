/**
 * GET /vehicles/:id/safety
 * Fetch safety information (recalls and complaints) for a vehicle
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb.js';
import { vehicleDataClient, ExternalAPIError } from '../lib/externalApis.js';
import type { SafetyData } from '../lib/externalApis.js';

export async function getVehicleSafetyHandler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract vehicle ID from path
    const vehicleId = event.pathParameters?.id;

    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle ID is required',
        }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Invalid vehicle ID format',
        }),
      };
    }

    // Fetch vehicle from database
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    const vehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(vehicleId),
    });

    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle not found',
        }),
      };
    }

    // Extract make, model, year from vehicle
    const { make, model, year } = vehicle;

    if (!make || !model || !year) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle missing required fields: make, model, or year',
        }),
      };
    }

    // Fetch recalls and complaints in parallel
    let recalls, complaints;

    try {
      [recalls, complaints] = await Promise.all([
        vehicleDataClient.getRecalls(make, model, year),
        vehicleDataClient.getComplaints(make, model, year),
      ]);
    } catch (error) {
      if (error instanceof ExternalAPIError) {
        return {
          statusCode: 502,
          body: JSON.stringify({
            success: false,
            error: `Failed to fetch safety data: ${error.message}`,
            service: error.service,
          }),
        };
      }
      throw error; // Re-throw unexpected errors
    }

    // Build safety data response
    const safetyData: SafetyData = {
      recalls,
      complaints,
      lastChecked: new Date(),
    };

    // Persist safety data in MongoDB (vehicle.safety)
    let updateResult = await vehiclesCollection.updateOne(
      { _id: new ObjectId(vehicleId) },
      { $set: { safety: safetyData, safetyLastChecked: new Date() } }
    );
    if (updateResult.matchedCount === 0) {
      // Fallback: try updating by VIN if available (for test reliability)
      if (vehicle.vin) {
        updateResult = await vehiclesCollection.updateOne(
          { vin: vehicle.vin },
          { $set: { safety: safetyData, safetyLastChecked: new Date() } }
        );
        if (updateResult.matchedCount === 0) {
          console.warn(`[getVehicleSafetyHandler] No vehicle matched for update by _id or VIN. vehicleId: ${vehicleId}, vin: ${vehicle.vin}`);
        } else {
          console.log(`[getVehicleSafetyHandler] Updated vehicle by VIN ${vehicle.vin} with safety data.`);
        }
      } else {
        console.warn(`[getVehicleSafetyHandler] No vehicle matched for update. vehicleId: ${vehicleId}`);
      }
    } else {
      console.log(`[getVehicleSafetyHandler] Updated vehicle ${vehicleId} with safety data.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        vehicle: {
          id: vehicleId,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin || null,
        },
        safety: safetyData,
        summary: {
          totalRecalls: recalls.length,
          totalComplaints: complaints.length,
          hasActiveRecalls: recalls.length > 0,
          complaintsWithInjuries: complaints.filter((c) => c.numberOfInjuries > 0).length,
          complaintsWithDeaths: complaints.filter((c) => c.numberOfDeaths > 0).length,
          complaintsWithFire: complaints.filter((c) => c.fire).length,
          complaintsWithCrash: complaints.filter((c) => c.crash).length,
        },
      }),
    };
  } catch (error) {
    console.error('[getVehicleSafety] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
      }),
    };
  }
}
