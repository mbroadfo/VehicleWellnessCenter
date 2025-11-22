import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb';

/**
 * POST /vehicles
 * Creates a new vehicle with basic VIN information
 * 
 * Request body:
 * {
 *   "vin": "1HGCM82633A123456",
 *   "ownerId": "user_123",
 *   "nickname"?: "My Car"
 * }
 */
export async function createVehicle(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { vin, ownerId, nickname } = body;

    if (!vin || !ownerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields: vin, ownerId',
        }),
      };
    }

    // Validate VIN format (17 characters, alphanumeric)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid VIN format. Must be 17 alphanumeric characters.',
        }),
      };
    }

    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    // Check if vehicle with this VIN already exists
    const existingVehicle = await vehiclesCollection.findOne({
      'identification.vin': vin.toUpperCase(),
    });

    if (existingVehicle) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Vehicle with this VIN already exists',
          vehicleId: existingVehicle._id.toString(),
        }),
      };
    }

    // Create basic vehicle document
    const vehicleOid = new ObjectId();
    const now = new Date();

    const vehicle = {
      _id: vehicleOid,
      identification: {
        vin: vin.toUpperCase(),
      },
      ownership: {
        ownerId,
        nickname: nickname || null,
      },
      odometer: {
        current: null,
        unit: 'miles',
      },
      createdAt: now,
      updatedAt: now,
    };

    await vehiclesCollection.insertOne(vehicle);

    return {
      statusCode: 201,
      body: JSON.stringify({
        _id: vehicleOid.toString(),
        identification: vehicle.identification,
        ownership: vehicle.ownership,
        odometer: vehicle.odometer,
        createdAt: vehicle.createdAt.toISOString(),
        updatedAt: vehicle.updatedAt.toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error creating vehicle:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create vehicle',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}
