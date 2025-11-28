import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getDatabase } from '../lib/mongodb';

/**
 * GET /vehicles
 * Lists all vehicles for the authenticated user
 */
export async function listVehicles(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract user ID from JWT token
    // @ts-expect-error - API Gateway v2 types don't include authorizer property correctly
    const ownerId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!ownerId) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'User ID not found in token. Authentication required.',
        }),
      };
    }

    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    // Debug: Log the user ID we're searching for
    console.log('[listVehicles] Searching for vehicles with ownerId:', ownerId);

    // Find all vehicles owned by this user
    const vehicles = await vehiclesCollection
      .find({
        'ownership.ownerId': ownerId,
      })
      .toArray();

    // Debug: Log what we found
    console.log('[listVehicles] Found vehicles count:', vehicles.length);
    if (vehicles.length > 0) {
      vehicles.forEach((v: any) => {
        console.log(`[listVehicles] Vehicle: _id=${v._id}, ownerId=${v.ownership?.ownerId}, VIN=${v.identification?.vin}`);
      });
    } else {
      // Check if vehicle exists with different ownerId
      const allVehicles = await vehiclesCollection.find({}).limit(5).toArray();
      console.log('[listVehicles] Sample vehicles in database (showing first 5):');
      allVehicles.forEach((v: any) => {
        console.log(`  _id=${v._id}, ownerId=${v.ownership?.ownerId || 'NOT SET'}, VIN=${v.identification?.vin || v.vin}`);
      });
    }

    // Transform to response format
    const response = vehicles.map((vehicle: any) => ({
      _id: vehicle._id.toString(),
      vin: vehicle.identification?.vin || vehicle.vin,
      year: vehicle.identification?.year,
      make: vehicle.identification?.make,
      model: vehicle.identification?.model,
      nickname: vehicle.ownership?.nickname,
      createdAt: vehicle.createdAt,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error listing vehicles:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to list vehicles',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}
