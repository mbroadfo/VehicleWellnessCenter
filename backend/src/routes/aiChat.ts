import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getSecrets } from "../lib/mongodb";
import { getAuth0Token } from "../lib/auth0";

/**
 * AI Chat Handler - Data Curator Pattern
 * 
 * This handler acts as the AI Data Curator. It receives natural language
 * queries and uses Google Gemini to understand intent and execute actions
 * by calling our existing CRUD Lambda functions via API Gateway.
 * 
 * Key benefit: AI uses YOUR validation logic, YOUR business rules, YOUR schema.
 * When you update recordVehicleEvent validation, the AI automatically respects it.
 * 
 * This is simpler than having a separate orchestrator Lambda - it just lives
 * alongside your other handlers in the same Lambda, sharing code and connection pools.
 */

interface ChatRequest {
  message: string;
  vehicleId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface ChatResponse {
  message: string;
  toolsUsed?: string[];
  error?: string;
}

// Function declarations that tell Gemini about our existing CRUD endpoints
const FUNCTION_DECLARATIONS = [
  {
    name: "getVehicleOverview",
    description: "Get comprehensive vehicle details from MongoDB including make, model, year, mileage, and recent events. Use this to verify vehicle exists or get current mileage before creating events.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vehicleId: {
          type: SchemaType.STRING,
          description: "The MongoDB ObjectId of the vehicle (24-character hex string)"
        }
      },
      required: ["vehicleId"]
    }
  },
  {
    name: "listVehicleEvents",
    description: "List vehicle maintenance and repair events from MongoDB. Returns chronological history of oil changes, repairs, inspections, etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vehicleId: {
          type: SchemaType.STRING,
          description: "The MongoDB ObjectId of the vehicle"
        },
        eventType: {
          type: SchemaType.STRING,
          description: "Optional filter by event type (e.g., 'oil_change', 'tire_rotation', 'repair')"
        },
        limit: {
          type: SchemaType.NUMBER,
          description: "Optional maximum number of events to return (default: 10)"
        }
      },
      required: ["vehicleId"]
    }
  },
  {
    name: "recordVehicleEvent",
    description: "Create a new vehicle maintenance or repair event in MongoDB. ALWAYS call getVehicleOverview first to verify vehicle exists and get current mileage.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vehicleId: {
          type: SchemaType.STRING,
          description: "The MongoDB ObjectId of the vehicle"
        },
        type: {
          type: SchemaType.STRING,
          description: "Event type in snake_case (e.g., 'oil_change', 'tire_rotation', 'brake_service', 'repair', 'inspection')"
        },
        occurredAt: {
          type: SchemaType.STRING,
          description: "ISO 8601 date-time when event occurred (e.g., '2025-11-13T10:30:00Z'). Convert natural language dates to ISO format."
        },
        summary: {
          type: SchemaType.STRING,
          description: "Brief description of the event"
        },
        cost: {
          type: SchemaType.NUMBER,
          description: "Optional cost in dollars (must be positive number)"
        },
        mileage: {
          type: SchemaType.NUMBER,
          description: "Optional vehicle mileage at time of event (must be positive integer). Use current mileage from getVehicleOverview if not specified."
        },
        notes: {
          type: SchemaType.STRING,
          description: "Optional additional notes or details"
        }
      },
      required: ["vehicleId", "type", "occurredAt", "summary"]
    }
  },
  {
    name: "enrichVehicleFromVIN",
    description: "Decode VIN and enrich vehicle with specifications from NHTSA vPIC API. Returns engine specs, body type, safety features, transmission details. Use this when user provides a VIN or asks about vehicle specifications.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vehicleId: {
          type: SchemaType.STRING,
          description: "The MongoDB ObjectId of the vehicle to enrich"
        },
        vin: {
          type: SchemaType.STRING,
          description: "Optional 17-character Vehicle Identification Number. If not provided, will use VIN already stored in vehicle document."
        }
      },
      required: ["vehicleId"]
    }
  }
];

// System instructions that define the AI's role as Data Curator
const SYSTEM_INSTRUCTION = `
You are a Vehicle Data Curator AI for the Vehicle Wellness Center application.

YOUR ROLE:
You help users manage their vehicle history by creating, reading, and understanding 
vehicle events. You also enrich vehicle data with specifications from authoritative sources.

AVAILABLE TOOLS:
1. getVehicleOverview(vehicleId) - Get vehicle details from MongoDB
2. listVehicleEvents(vehicleId, eventType?, limit?) - List vehicle events from MongoDB
3. recordVehicleEvent(vehicleId, type, occurredAt, summary, cost?, mileage?, notes?) - Create event in MongoDB
4. enrichVehicleFromVIN(vehicleId, vin?) - Decode VIN and enrich vehicle with NHTSA specifications

DATA INTEGRITY RULES (CRITICAL):

Before creating events:
✅ ALWAYS call getVehicleOverview first to verify vehicle exists
✅ ALWAYS validate occurredAt is a valid ISO 8601 date
✅ ALWAYS ensure cost (if provided) is a positive number
✅ ALWAYS ensure mileage (if provided) is a positive integer
✅ ALWAYS use current vehicle mileage from getVehicleOverview if user doesn't specify
✅ NEVER create events for non-existent vehicles

Event type standardization:
- Use snake_case: oil_change, tire_rotation, brake_service
- Common types: oil_change, tire_rotation, inspection, repair, acquisition, tire_replacement
- If user says "oil change" → type: "oil_change"
- If user says "new tires" → type: "tire_replacement"
- If user says "brakes" → type: "brake_service"

Date handling:
- "yesterday" → subtract 1 day from current date
- "last week" → subtract 7 days
- "two months ago" → subtract 2 months
- Always convert to ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ
- Current date: ${new Date().toISOString().split('T')[0]}

Cost handling:
- "$45" or "forty-five dollars" → 45.00
- Always numeric, always positive
- If user doesn't specify currency, assume USD

CONVERSATIONAL GUIDELINES:
✅ Be proactive: "I see your vehicle is at 15,000 miles. You're due for tire rotation."
✅ Validate user input: "Just to confirm, oil change from yesterday at $45?"
✅ Handle errors gracefully: "I couldn't find that vehicle. Could you provide the ID?"
✅ Suggest next actions: "I've recorded your oil change. View upcoming maintenance?"
✅ Explain what you're doing: "Let me check your vehicle details first..."

REMEMBER: You are the trusted curator of vehicle data. Be accurate, helpful, and 
maintain data integrity at all times.
`;

/**
 * Execute a function call by invoking existing CRUD Lambda via API Gateway
 * This ensures the AI uses YOUR validation logic and business rules
 */
async function executeFunctionCall(
  functionName: string,
  args: Record<string, unknown>,
  apiUrl: string,
  authToken: string
): Promise<unknown> {
  const baseUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash

  try {
    switch (functionName) {
      case "getVehicleOverview": {
        const { vehicleId } = args as { vehicleId: string };
        const url = `${baseUrl}/vehicles/${vehicleId}/overview`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API call failed (${response.status}): ${errorText}`);
        }

        return await response.json();
      }

      case "listVehicleEvents": {
        const { vehicleId, eventType, limit } = args as {
          vehicleId: string;
          eventType?: string;
          limit?: number;
        };

        const params = new URLSearchParams();
        if (eventType) params.append("eventType", eventType);
        if (limit) params.append("limit", limit.toString());

        const queryString = params.toString();
        const url = `${baseUrl}/vehicles/${vehicleId}/events${queryString ? `?${queryString}` : ''}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API call failed (${response.status}): ${errorText}`);
        }

        return await response.json();
      }

      case "recordVehicleEvent": {
        const { vehicleId, type, occurredAt, summary, cost, mileage, notes } = args as {
          vehicleId: string;
          type: string;
          occurredAt: string;
          summary: string;
          cost?: number;
          mileage?: number;
          notes?: string;
        };

        const url = `${baseUrl}/vehicles/${vehicleId}/events`;
        const payload: Record<string, unknown> = {
          type,
          occurredAt,
          summary
        };

        if (cost !== undefined) payload.cost = cost;
        if (mileage !== undefined) payload.mileage = mileage;
        if (notes) payload.notes = notes;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API call failed (${response.status}): ${errorText}`);
        }

        return await response.json();
      }

      case "enrichVehicleFromVIN": {
        const { vehicleId, vin } = args as {
          vehicleId: string;
          vin?: string;
        };

        const url = `${baseUrl}/vehicles/${vehicleId}/enrich`;
        const payload: Record<string, unknown> = {};

        if (vin) payload.vin = vin;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API call failed (${response.status}): ${errorText}`);
        }

        return await response.json();
      }

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  } catch (error) {
    console.error(`Error executing ${functionName}:`, error);
    throw error;
  }
}

/**
 * Main Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("AI Chat request:", JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing request body" })
      };
    }

    const request: ChatRequest = JSON.parse(event.body);

    if (!request.message) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing 'message' field" })
      };
    }

    // Get secrets (includes GOOGLE_API_KEY)
    const secrets = await getSecrets();
    const googleApiKey = (secrets as unknown as Record<string, string>).GOOGLE_API_KEY;

    if (!googleApiKey) {
      throw new Error("GOOGLE_API_KEY not found in secrets");
    }

    // Get Auth0 token for calling our existing APIs
    const authToken = await getAuth0Token();

    // Get API URL from environment
    const apiUrl = process.env.LAMBDA_APP_URL;
    if (!apiUrl) {
      throw new Error("LAMBDA_APP_URL environment variable not set");
    }

    // Initialize Gemini
    // Using gemini-2.5-flash based on your usage logs showing traffic for this model
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }]
    });

    // Start chat session
    const chat = model.startChat({
      history: request.conversationHistory?.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      })) || []
    });

    // Build context with vehicleId if provided
    let userMessage = request.message;
    if (request.vehicleId) {
      userMessage = `[Context: User is viewing vehicle ${request.vehicleId}]\n\n${request.message}`;
    }

    // Send message and handle function calls
    let result = await chat.sendMessage(userMessage);
    const toolsUsed: string[] = [];

    // Handle function calls (may be multiple rounds)
    const functionCalls = result.response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];

      for (const functionCall of functionCalls) {
        console.log(`Executing function: ${functionCall.name}`, functionCall.args);
        toolsUsed.push(functionCall.name);

        try {
          const functionResult = await executeFunctionCall(
            functionCall.name,
            functionCall.args as Record<string, unknown>,
            apiUrl,
            authToken
          );

          functionResponses.push({
            functionResponse: {
              name: functionCall.name,
              response: functionResult
            }
          });
        } catch (error) {
          console.error(`Function ${functionCall.name} failed:`, error);
          functionResponses.push({
            functionResponse: {
              name: functionCall.name,
              response: {
                error: error instanceof Error ? error.message : "Unknown error"
              }
            }
          });
        }
      }

      // Send function results back to AI
      result = await chat.sendMessage(functionResponses as any); // Gemini SDK type mismatch
    }

    // Extract final response text
    const responseText = result.response.text();

    const response: ChatResponse = {
      message: responseText,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error("AI Chat error:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    };
  }
};
