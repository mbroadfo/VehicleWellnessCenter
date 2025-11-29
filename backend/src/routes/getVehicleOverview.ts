import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ObjectId } from "mongodb";
import { getDatabase } from "../lib/mongodb";

/**
 * Lambda handler for getVehicleOverview
 * GET /vehicles/{vehicleId}/overview
 * 
 * Returns the full vehicle document with all nested data (specs, safety, fuelEconomy, etc.)
 * This matches the frontend Vehicle interface structure.
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const vehicleId = event.pathParameters?.vehicleId;

    if (!vehicleId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "vehicleId is required" }),
      };
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid vehicleId format" }),
      };
    }

    const db = await getDatabase();
    const vehiclesCollection = db.collection("vehicles");

    // Fetch vehicle details
    const vehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(vehicleId),
    });

    if (!vehicle) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Vehicle not found" }),
      };
    }

    // Transform MongoDB document to frontend Vehicle interface
    // Convert ObjectId to string and preserve all nested data
    const response = {
      _id: vehicle._id.toString(),
      vin: (vehicle as any).identification?.vin || (vehicle as any).vin,
      name: (vehicle as any).ownership?.nickname,
      // Check multiple sources for make/model/year: attributes, identification, specs
      year: (vehicle as any).attributes?.year || (vehicle as any).identification?.year || (vehicle as any).specs?.year,
      make: (vehicle as any).attributes?.make || (vehicle as any).identification?.make || (vehicle as any).specs?.make,
      model: (vehicle as any).attributes?.model || (vehicle as any).identification?.model || (vehicle as any).specs?.model,
      specs: (vehicle as any).specs,
      safety: (vehicle as any).safety,
      fuelEconomy: (vehicle as any).fuelEconomy,
      dealerPortal: (vehicle as any).dealerPortal,
      createdAt: (vehicle as any).createdAt,
      lastUpdated: (vehicle as any).lastUpdated,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error in getVehicleOverview:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
}
