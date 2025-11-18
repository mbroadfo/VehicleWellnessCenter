import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { handler as getVehicleOverviewHandler } from "./routes/getVehicleOverview";
import { handler as listVehicleEventsHandler } from "./routes/listVehicleEvents";
import { handler as recordVehicleEventHandler } from "./routes/recordVehicleEvent";
import { handler as aiChatHandler } from "./routes/aiChat";
import { enrichVehicleHandler } from "./routes/enrichVehicle";
import { getVehicleSafetyHandler } from "./routes/getVehicleSafety";
import { getConversationMessagesHandler } from "./routes/getConversationMessages";

/**
 * Main Lambda Router
 * 
 * Single Lambda function that routes requests to appropriate handlers
 * based on HTTP method and route path.
 * 
 * Benefits of single Lambda:
 * - Shared connection pool (MongoDB, Auth0)
 * - Simpler infrastructure (1 Lambda vs 4+)
 * - Easier to add new routes
 * - Lower cost (single cold start overhead)
 */

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  console.log(`[Router] ${method} ${path}`);

  try {
    // Route to appropriate handler
    if (method === "GET" && path.match(/^\/vehicles\/[^/]+\/overview$/)) {
      return await getVehicleOverviewHandler(event);
    }

    if (method === "GET" && path.match(/^\/vehicles\/[^/]+\/events$/)) {
      return await listVehicleEventsHandler(event);
    }

    if (method === "POST" && path.match(/^\/vehicles\/[^/]+\/events$/)) {
      return await recordVehicleEventHandler(event);
    }

    if (method === "POST" && path === "/ai/chat") {
      return await aiChatHandler(event);
    }

    if (method === "POST" && path.match(/^\/vehicles\/[^/]+\/enrich$/)) {
      return await enrichVehicleHandler(event);
    }

    if (method === "GET" && path.match(/^\/vehicles\/[^/]+\/safety$/)) {
      return await getVehicleSafetyHandler(event);
    }

    if (method === "GET" && path.match(/^\/conversations\/[^/]+\/messages$/)) {
      return await getConversationMessagesHandler(event);
    }

    // 404 - Route not found
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Not Found",
        message: `Route ${method} ${path} not found`
      })
    };
  } catch (error) {
    console.error("[Router] Unhandled error:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};
