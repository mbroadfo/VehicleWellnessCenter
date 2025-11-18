import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ObjectId } from "mongodb";
import { getSecrets, getDatabase } from "../lib/mongodb";
import { getAuth0Token } from "../lib/auth0";
import type { ConversationMessage, ConversationSession, ChatRequest, ChatResponse } from "../lib/conversationTypes.js";

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

// ChatRequest and ChatResponse now imported from conversationTypes.ts

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

    // Extract userId from JWT claims (API Gateway v2 authorizer context)
    const userId = (event.requestContext as any).authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized: missing user ID" })
      };
    }

    // Get MongoDB connection
    const db = await getDatabase();
    const sessionsCollection = db.collection<ConversationSession>('conversation_sessions');
    const messagesCollection = db.collection<ConversationMessage>('conversation_messages');

    // Determine session ID (create new or use existing)
    let sessionId: ObjectId;
    let isNewSession = false;

    if (request.sessionId) {
      // Validate existing session ID
      if (!ObjectId.isValid(request.sessionId)) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid session ID format" })
        };
      }
      sessionId = new ObjectId(request.sessionId);

      // Verify session exists and belongs to user
      const existingSession = await sessionsCollection.findOne({ _id: sessionId, userId });
      if (!existingSession) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Session not found or access denied" })
        };
      }
    } else {
      // Create new session
      sessionId = new ObjectId();
      isNewSession = true;

      const newSession: ConversationSession = {
        _id: sessionId,
        userId,
        vehicleId: request.vehicleId ? new ObjectId(request.vehicleId) : null,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        messageCount: 0,
        title: null // Will be set from first message
      };

      await sessionsCollection.insertOne(newSession);
      console.log(`Created new conversation session: ${sessionId.toString()}`);
    }

    // Load conversation history from MongoDB (last 20 messages)
    const conversationHistory = await messagesCollection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .limit(20)
      .toArray();

    console.log(`Loaded ${conversationHistory.length} messages from session ${sessionId.toString()}`);

    // Persist user message to MongoDB
    const userMessageDoc: ConversationMessage = {
      sessionId,
      userId,
      vehicleId: request.vehicleId ? new ObjectId(request.vehicleId) : null,
      role: 'user',
      content: request.message,
      timestamp: new Date()
    };

    await messagesCollection.insertOne(userMessageDoc);
    console.log(`Persisted user message to session ${sessionId.toString()}`);

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

    // Build history for Gemini from MongoDB messages
    const geminiHistory = conversationHistory.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }]
    }));

    // Start chat session with history
    const chat = model.startChat({
      history: geminiHistory
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

    // Persist AI response to MongoDB
    const assistantMessageDoc: ConversationMessage = {
      sessionId,
      userId,
      vehicleId: request.vehicleId ? new ObjectId(request.vehicleId) : null,
      role: 'assistant',
      content: responseText,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : null,
      timestamp: new Date()
    };

    await messagesCollection.insertOne(assistantMessageDoc);
    console.log(`Persisted assistant response to session ${sessionId.toString()}`);

    // Update session metadata
    const updateSession: Partial<ConversationSession> = {
      lastActiveAt: new Date(),
      messageCount: conversationHistory.length + 2 // +2 for user + assistant messages just added
    };

    // Set title from first user message (if new session)
    if (isNewSession) {
      // Generate simple title from first message (first 50 chars)
      updateSession.title = request.message.substring(0, 50) + (request.message.length > 50 ? '...' : '');
    }

    await sessionsCollection.updateOne(
      { _id: sessionId },
      { $set: updateSession }
    );

    const response: ChatResponse = {
      success: true,
      sessionId: sessionId.toString(),
      message: responseText,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      conversationContext: {
        messageCount: updateSession.messageCount || 0,
        historyUsed: conversationHistory.length
      }
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
