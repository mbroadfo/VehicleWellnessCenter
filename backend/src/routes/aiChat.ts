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
  },
  {
    name: "getVehicleSafety",
    description: "Get comprehensive safety data including NHTSA recalls, consumer complaints, and NCAP crash test ratings. Use when user asks about recalls, safety, or crash ratings.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vehicleId: {
          type: SchemaType.STRING,
          description: "The MongoDB ObjectId of the vehicle"
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

CONTEXT AWARENESS:
When you receive a message with "[Context: User is viewing vehicle {vehicleId}]", that 
is the active vehicle the user is asking about. USE THAT VEHICLE ID for all function calls 
unless the user explicitly mentions a different vehicle. Do NOT ask for the vehicle ID if 
it's provided in the context.

IMPORTANT: For new conversations, full vehicle context is PRE-LOADED automatically including:
- Vehicle details (year, make, model, VIN)
- Specifications (engine, transmission, body type)
- Safety data (recalls, complaints, NCAP ratings)
- Fuel economy (EPA city/highway/combined MPG)

You can answer questions about specs, safety, and fuel economy WITHOUT calling getVehicleOverview 
again if the context is already provided. Only call getVehicleOverview if you need updated data 
or if context wasn't provided.

AVAILABLE TOOLS:
1. getVehicleOverview(vehicleId) - Get ALL vehicle data including specs, safety, fuel economy, and details. Use this for most queries!
2. listVehicleEvents(vehicleId, eventType?, limit?) - List vehicle maintenance history
3. recordVehicleEvent(vehicleId, type, occurredAt, summary, cost?, mileage?, notes?) - Create event
4. enrichVehicleFromVIN(vehicleId, vin?) - Decode VIN and get NHTSA specifications
5. getVehicleSafety(vehicleId) - Get ONLY safety data (recalls, complaints, NCAP). Only use if getVehicleOverview already called.

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

UNDERSTANDING DATA SOURCES:
- getVehicleOverview returns EVERYTHING: specs, safety (recalls/complaints/NCAP), fuel economy (EPA MPG), dealer data, mileage
- When user asks about fuel economy, safety, or specs: call getVehicleOverview and extract the relevant section
- Example: User asks "what's my fuel economy?" → Call getVehicleOverview → Return vehicle.fuelEconomy.epa data
- Only use getVehicleSafety if you already called getVehicleOverview and need ONLY updated safety data

CONVERSATIONAL GUIDELINES:
✅ Be proactive: "I see your vehicle is at 15,000 miles. You're due for tire rotation."
✅ Validate user input: "Just to confirm, oil change from yesterday at $45?"
✅ Handle errors gracefully: "I couldn't find that vehicle. Could you provide the ID?"
✅ Suggest next actions: "I've recorded your oil change. View upcoming maintenance?"
✅ Explain what you're doing: "Let me check your vehicle details first..."
✅ For fuel economy/safety/specs: Use getVehicleOverview and extract the specific data requested

INITIAL GREETING FORMAT (CRITICAL - FOLLOW EXACTLY):
When user first opens chat with a vehicle, you MUST:
1. Call getVehicleSafety to load complete recall and complaint data
2. Present ALL sections below in this exact format with ACTUAL data:

## 📋 Vehicle Overview
- Year, Make, Model (from pre-loaded context)
- VIN (from pre-loaded context)
- Engine: [cylinders] cyl, [displacement]L [fuel type] (from context)
- Fuel Economy: [city]/[highway]/[combined] MPG (from context)

## ⚠️ Safety Recalls ([count] found)

**AI Summary:**
[After calling getVehicleSafety, provide a 2-3 sentence executive summary:
- What components are most affected?
- Are any recalls safety-critical (airbags, brakes, steering)?
- Any patterns or common manufacturer issues?]

**Recall Details:**
[List actual recalls:
- For each recall show: NHTSA Campaign #, Component, Summary
- Keep summaries concise (1-2 lines each)
- List ALL recalls, don't truncate]

📝 **Your Notes on Recalls**
_[This section is empty - user can add their own summary or notes about recall status]_

## 💬 Customer Complaints ([count] found)

**AI Summary:**
[After analyzing complaints from getVehicleSafety, provide a 2-3 sentence overview:
- What are the most common failure points?
- Are complaints increasing over time or clustered in specific model years?
- Any severe safety concerns mentioned repeatedly?]

**Complaint Categories:**
[Show top complaint patterns:
- Group by component (e.g., "Air Bags: 45 complaints")
- Show 5-7 most common categories
- Brief description of typical issues for each]

📝 **Your Experience Summary**
_[This section is empty - user can describe if they've experienced similar issues]_

## 🔧 Maintenance Records
[Call listVehicleEvents - if events exist, list them here]

📝 **Add Service Records**

**Paste from Dealer Portal:**
_[Empty - paste your dealer maintenance history here]_

**Or just tell me:** "Oil change yesterday" or "New tires last month, $800"

---

Ready to help! What would you like to add or track?

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

      case "getVehicleSafety": {
        const { vehicleId } = args as { vehicleId: string };
        const url = `${baseUrl}/vehicles/${vehicleId}/safety`;
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
    // Using gemini-2.0-flash (stable model with better free-tier quotas)
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
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
    let vehicleContext = '';
    
    // If this is a new session with a vehicleId, automatically load vehicle data
    // and force the AI to present the full structured report
    if (request.vehicleId && isNewSession) {
      try {
        console.log(`Auto-loading vehicle context for ${request.vehicleId}`);
        const vehicleData = await executeFunctionCall(
          'getVehicleOverview',
          { vehicleId: request.vehicleId },
          apiUrl,
          authToken
        );
        
        // Build rich context from vehicle data
        const v = vehicleData as any;
        vehicleContext = `[Vehicle Context]
- ID: ${v._id}
- VIN: ${v.vin || 'N/A'}
- Vehicle: ${v.year || ''} ${v.make || ''} ${v.model || ''}
- Specs: ${v.specs ? `${v.specs.engine?.cylinders}cyl ${v.specs.engine?.displacement}L ${v.specs.engine?.fuelType || ''}` : 'Not available'}
- Safety: ${v.safety ? `${v.safety.recalls?.length || 0} recalls, ${v.safety.complaints?.length || 0} complaints, ${v.safety.ncapRating?.overall || 'N/A'}-star rating` : 'Not available'}
- Fuel Economy: ${v.fuelEconomy?.epa ? `${v.fuelEconomy.epa.city}/${v.fuelEconomy.epa.highway}/${v.fuelEconomy.epa.combined} MPG` : 'Not available'}

`;
        
        console.log(`Loaded vehicle context: ${v.year} ${v.make} ${v.model}`);
        
        // Override user message to force structured report on first greeting
        userMessage = `[Context: User is viewing vehicle ${request.vehicleId}]
${vehicleContext}

CRITICAL INSTRUCTION: This is the FIRST message in a new conversation. You MUST present the complete structured vehicle report with ALL sections as specified in your INITIAL GREETING FORMAT instructions. User said: "${request.message}"

Present the complete report now, including all empty sections for user input.`;
        
      } catch (error) {
        console.error('Failed to load vehicle context:', error);
        // Continue without context - AI can still call getVehicleOverview if needed
        if (request.vehicleId) {
          userMessage = `[Context: User is viewing vehicle ${request.vehicleId}]\n${request.message}`;
        }
      }
    } else if (request.vehicleId) {
      userMessage = `[Context: User is viewing vehicle ${request.vehicleId}]\n${vehicleContext}\n${request.message}`;
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

    console.log('[aiChat] Returning response:', {
      sessionId: response.sessionId,
      messageLength: response.message.length,
      toolsUsedCount: response.toolsUsed?.length || 0,
      firstChars: response.message.substring(0, 100)
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error("AI Chat error:", error);

    // Handle rate limit errors specifically
    if (error instanceof Error && error.message.includes('429')) {
      return {
        statusCode: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Rate limit exceeded",
          message: "The AI service is temporarily unavailable due to high usage. Please try again in a few seconds.",
          retryAfter: 20 // seconds
        })
      };
    }

    // Handle quota exceeded errors
    if (error instanceof Error && error.message.includes('quota')) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Service temporarily unavailable",
          message: "The AI service has reached its usage limit. Please try again shortly.",
          retryAfter: 60 // seconds
        })
      };
    }

    // Generic error handling
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "An unexpected error occurred. Please try again."
      })
    };
  }
};
