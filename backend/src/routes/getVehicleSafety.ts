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
    // Extract vehicle ID from path (API Gateway v2 uses {vehicleId} in route)
    const vehicleId = event.pathParameters?.vehicleId || event.pathParameters?.id;

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

    // Extract make, model, year from vehicle (check both nested and flat locations)
    const vehicleAny = vehicle as any;
    const make = vehicleAny.identification?.make || vehicleAny.specs?.make || vehicleAny.attributes?.make || vehicleAny.make;
    const model = vehicleAny.identification?.model || vehicleAny.specs?.model || vehicleAny.attributes?.model || vehicleAny.model;
    const year = vehicleAny.identification?.year || vehicleAny.specs?.year || vehicleAny.attributes?.year || vehicleAny.year;

    if (!make || !model || !year) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle missing required fields: make, model, or year',
          debug: {
            make,
            model,
            year,
            identification: vehicleAny.identification,
            specs: vehicleAny.specs,
          },
        }),
      };
    }

    // Fetch recalls, complaints, and NCAP ratings in parallel
    let recalls, complaints, ncapRating;

    try {
      [recalls, complaints, ncapRating] = await Promise.all([
        vehicleDataClient.getRecalls(make, model, year),
        vehicleDataClient.getComplaints(make, model, year),
        vehicleDataClient.getSafetyRatings(year, make, model),
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

    // Add NCAP ratings if available (separate from SafetyData for backward compatibility)
    const safetyResponse = {
      ...safetyData,
      ...(ncapRating && { ncapRating }),
    };

    // Persist safety data in MongoDB (vehicle.safety + vehicle.ncapRating)
    const updateDoc: Record<string, unknown> = {
      safety: safetyData,
      safetyLastChecked: new Date(),
    };
    
    if (ncapRating) {
      updateDoc.ncapRating = ncapRating;
    }

    let updateResult = await vehiclesCollection.updateOne(
      { _id: new ObjectId(vehicleId) },
      { $set: updateDoc }
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
        safety: safetyResponse,
        summary: {
          totalRecalls: recalls.length,
          totalComplaints: complaints.length,
          hasActiveRecalls: recalls.length > 0,
          hasNCAPRatings: !!ncapRating,
          overallRating: ncapRating?.overall || null,
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
