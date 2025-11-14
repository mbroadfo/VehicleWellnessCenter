import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ObjectId } from "mongodb";
import { getDatabase } from "../lib/mongodb";

interface VehicleOverview {
  vehicleId: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  odometer?: number;
  acquisitionDate?: string;
  estimatedValue?: number;
  eventCount: number;
  recentEvents: Array<{
    _id: string;
    type: string;
    emoji?: string;
    occurredAt: string;
    summary: string;
  }>;
  upcomingMaintenance?: Array<{
    type: string;
    dueDate?: string;
    dueMileage?: number;
  }>;
}

/**
 * Lambda handler for getVehicleOverview
 * GET /vehicles/{vehicleId}/overview
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
    const eventsCollection = db.collection("vehicleEvents");

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

    // Count total events
    const eventCount = await eventsCollection.countDocuments({
      vehicleId: new ObjectId(vehicleId),
    });

    // Fetch recent events (last 5)
    const recentEvents = await eventsCollection
      .find({ vehicleId: new ObjectId(vehicleId) })
      .sort({ occurredAt: -1 })
      .limit(5)
      .toArray();

    // Build overview response
    const overview: VehicleOverview = {
      vehicleId: vehicle._id.toString(),
      vin: vehicle.vin,
      make: vehicle.attributes?.make as string | undefined,
      model: vehicle.attributes?.model as string | undefined,
      year: vehicle.attributes?.year as number | undefined,
      odometer: vehicle.odometer?.current as number | undefined,
      acquisitionDate: vehicle.acquisition?.date as string | undefined,
      estimatedValue: vehicle.valuation?.estimatedValue as number | undefined,
      eventCount,
      recentEvents: recentEvents.map((event) => ({
        _id: event._id.toString(),
        type: event.type as string,
        emoji: event.emoji as string | undefined,
        occurredAt: event.occurredAt as string,
        summary: event.summary as string,
      })),
      // TODO: Implement upcoming maintenance logic based on forecast field
      upcomingMaintenance: [],
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overview),
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
