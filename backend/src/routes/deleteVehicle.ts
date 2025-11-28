import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ObjectId } from "mongodb";
import { getDatabase } from "../lib/mongodb";

/**
 * DELETE /vehicles/{vehicleId}
 * 
 * Deletes a vehicle and all its related data:
 * - Vehicle document
 * - All vehicle events
 * - Conversation sessions (where vehicleId matches)
 * - Conversation messages (via session cleanup)
 * 
 * Returns 204 No Content on success.
 */
export async function deleteVehicle(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const vehicleId = event.pathParameters?.vehicleId || event.pathParameters?.id;

  // Validate vehicleId parameter
  if (!vehicleId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Bad Request",
        message: "vehicleId path parameter is required"
      })
    };
  }

  // Validate ObjectId format
  if (!ObjectId.isValid(vehicleId)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Bad Request",
        message: "Invalid vehicleId format"
      })
    };
  }

  try {
    const db = await getDatabase();
    const vehicleObjectId = new ObjectId(vehicleId);

    // Extract ownerId from JWT token (set by API Gateway authorizer)
    const ownerId = (event.requestContext as { authorizer?: { jwt?: { claims?: { sub?: string } } } }).authorizer?.jwt?.claims?.sub;
    if (!ownerId) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Unauthorized",
          message: "User identity not found"
        })
      };
    }

    // Check if vehicle exists and belongs to user
    const vehicle = await db.collection("vehicles").findOne({ 
      _id: vehicleObjectId,
      'ownership.ownerId': ownerId
    });
    if (!vehicle) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Not Found",
          message: "Vehicle not found"
        })
      };
    }

    // Delete all related data in parallel
    const [
      vehicleResult,
      eventsResult,
      sessionsResult
    ] = await Promise.all([
      // Delete vehicle document
      db.collection("vehicles").deleteOne({ _id: vehicleObjectId }),
      
      // Delete all vehicle events
      db.collection("vehicleEvents").deleteMany({ vehicleId: vehicleObjectId }),
      
      // Find conversation sessions for this vehicle (need IDs for message cleanup)
      db.collection("conversation_sessions").find({ vehicleId: vehicleObjectId }).toArray()
    ]);

    // Delete conversation messages for all sessions
    if (sessionsResult.length > 0) {
      const sessionIds = sessionsResult.map((s: { _id: ObjectId }) => s._id);
      await db.collection("conversation_messages").deleteMany({ 
        sessionId: { $in: sessionIds } 
      });
      
      // Delete the sessions themselves
      await db.collection("conversation_sessions").deleteMany({ 
        _id: { $in: sessionIds } 
      });
    }

    console.log(`[DeleteVehicle] Deleted vehicle ${vehicleId}:`, {
      vehicle: vehicleResult.deletedCount,
      events: eventsResult.deletedCount,
      sessions: sessionsResult.length,
      vin: vehicle.identification?.vin || vehicle.vin
    });

    return {
      statusCode: 204,
      headers: { "Content-Type": "application/json" },
      body: ""
    };

  } catch (error) {
    console.error("[DeleteVehicle] Error:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
}
