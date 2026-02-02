/**
 * Parse Maintenance Record Handler
 * 
 * Uses Google Gemini structured output to parse natural language maintenance
 * descriptions into structured JSON. Designed for fast typers who prefer
 * natural language over forms.
 * 
 * Route: POST /vehicles/{vehicleId}/events/parse-maintenance
 * Auth: JWT (Auth0)
 * 
 * Request body:
 * {
 *   "text": "Jiffy Lube 1/15/2026 45k miles - oil change, tire rotation, cabin filter $125"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "parsed": {
 *     "vendor": "Jiffy Lube",
 *     "date": "2026-01-15T00:00:00Z",
 *     "odometer": 45000,
 *     "services": [
 *       { "name": "Oil Change", "cost": 45.00 },
 *       { "name": "Tire Rotation", "cost": 40.00 },
 *       { "name": "Cabin Air Filter Replacement", "cost": 40.00 }
 *     ],
 *     "total": 125.00,
 *     "parts": [],
 *     "notes": ""
 *   }
 * }
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { getDatabase, getSecrets } from '../lib/mongodb';
import type { ParseMaintenanceRequest, ParseMaintenanceResponse, ParsedMaintenanceRecord } from '../lib/maintenanceTypes';

// Gemini structured output schema for maintenance records
const MAINTENANCE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    vendor: {
      type: SchemaType.STRING,
      description: "Name of the service provider (e.g., 'Jiffy Lube', 'Honda Dealership', 'Bob's Auto')",
      nullable: false
    },
    date: {
      type: SchemaType.STRING,
      description: "ISO 8601 date when maintenance was performed (e.g., '2026-01-15T00:00:00Z'). Parse dates like '1/15/2026' or 'yesterday' into ISO format.",
      nullable: false
    },
    odometer: {
      type: SchemaType.NUMBER,
      description: "Vehicle mileage at time of service. Parse values like '45k' as 45000, '123,456' as 123456.",
      nullable: false
    },
    services: {
      type: SchemaType.ARRAY,
      description: "List of services performed (e.g., oil change, tire rotation)",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Service name (e.g., 'Oil Change', 'Tire Rotation', 'Brake Inspection')",
            nullable: false
          },
          cost: {
            type: SchemaType.NUMBER,
            description: "Cost of this specific service in dollars. Estimate from total if not itemized.",
            nullable: true
          },
          notes: {
            type: SchemaType.STRING,
            description: "Additional details about this service",
            nullable: true
          }
        },
        required: ["name"]
      }
    },
    total: {
      type: SchemaType.NUMBER,
      description: "Total cost of all services in dollars (e.g., 125.00)",
      nullable: false
    },
    parts: {
      type: SchemaType.ARRAY,
      description: "Parts that warrant attention or were replaced",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: "Part name (e.g., 'Brake Pads', 'Air Filter', 'Wiper Blades')",
            nullable: false
          },
          quantity: {
            type: SchemaType.NUMBER,
            description: "Number of parts (default: 1)",
            nullable: true
          },
          notes: {
            type: SchemaType.STRING,
            description: "Additional notes (e.g., 'worn', 'replaced', 'at 30%')",
            nullable: true
          }
        },
        required: ["name"]
      }
    },
    notes: {
      type: SchemaType.STRING,
      description: "Any additional notes or observations from the maintenance record",
      nullable: true
    }
  },
  required: ["vendor", "date", "odometer", "services", "total"]
};

const SYSTEM_INSTRUCTION = `
You are a maintenance record parser. Your job is to extract structured data from natural language descriptions of vehicle maintenance.

PARSING RULES:

Date Handling:
- "1/15/2026", "Jan 15 2026", "January 15, 2026" → "2026-01-15T00:00:00Z"
- "yesterday" → subtract 1 day from today's date
- "last week" → subtract 7 days
- "two weeks ago" → subtract 14 days
- Always output ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ
- Current date: ${new Date().toISOString().split('T')[0]}

Mileage Handling:
- "45k" → 45000
- "123,456" → 123456
- "45k miles" → 45000
- Always output as integer

Service Names:
- Standardize common variations:
  - "oil change" → "Oil Change"
  - "tire rotation" → "Tire Rotation"
  - "brakes" → "Brake Service"
  - "new tires" → "Tire Replacement"
  - "inspection" → "Multi-Point Inspection"
- Use title case for all service names

Cost Handling:
- "$125", "$125.00", "125 dollars" → 125.00
- If total given but not itemized, estimate service costs proportionally
- Always numeric, always positive

Parts:
- Look for mentions like "replaced air filter", "worn brake pads at 30%", "new wiper blades"
- Extract part name and any condition notes

EXAMPLES:

Input: "Jiffy Lube 1/15/2026 45k miles - oil change, tire rotation, cabin filter $125"
Output: {
  "vendor": "Jiffy Lube",
  "date": "2026-01-15T00:00:00Z",
  "odometer": 45000,
  "services": [
    { "name": "Oil Change", "cost": 45.00 },
    { "name": "Tire Rotation", "cost": 40.00 },
    { "name": "Cabin Air Filter Replacement", "cost": 40.00 }
  ],
  "total": 125.00,
  "parts": [],
  "notes": ""
}

Input: "Honda dealership yesterday 52,300 miles inspection and oil change $89 - they said brake pads at 30%"
Output: {
  "vendor": "Honda Dealership",
  "date": "${new Date(Date.now() - 86400000).toISOString()}",
  "odometer": 52300,
  "services": [
    { "name": "Multi-Point Inspection", "cost": 20.00 },
    { "name": "Oil Change", "cost": 69.00 }
  ],
  "total": 89.00,
  "parts": [
    { "name": "Brake Pads", "notes": "at 30%" }
  ],
  "notes": "Brake pads at 30%"
}
`;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // Extract vehicleId from path
    const vehicleId = event.pathParameters?.vehicleId;
    if (!vehicleId || !ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Invalid or missing vehicleId'
        } as ParseMaintenanceResponse)
      };
    }

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Request body is required'
        } as ParseMaintenanceResponse)
      };
    }

    let request: ParseMaintenanceRequest;
    try {
      request = JSON.parse(event.body) as ParseMaintenanceRequest;
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        } as ParseMaintenanceResponse)
      };
    }

    // Validate text field
    if (!request.text || typeof request.text !== 'string' || request.text.trim() === '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'text field is required and must be a non-empty string'
        } as ParseMaintenanceResponse)
      };
    }

    // Verify vehicle exists and user owns it
    const db = await getDatabase();
    // @ts-expect-error - API Gateway v2 types don't include authorizer property correctly
    const ownerId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    
    const vehicle = await db.collection('vehicles').findOne({
      _id: new ObjectId(vehicleId),
      'ownership.ownerId': ownerId
    });

    if (!vehicle) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Vehicle not found or access denied'
        } as ParseMaintenanceResponse)
      };
    }

    // Initialize Gemini with structured output
    const secrets = await getSecrets();
    const genAI = new GoogleGenerativeAI(secrets.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: MAINTENANCE_SCHEMA as any
      }
    });

    // Parse maintenance record
    console.log(`[ParseMaintenance] Parsing text for vehicle ${vehicleId}:`, request.text.substring(0, 100));
    
    const result = await model.generateContent(request.text);
    const parsed = JSON.parse(result.response.text()) as ParsedMaintenanceRecord;

    console.log(`[ParseMaintenance] Successfully parsed:`, {
      vendor: parsed.vendor,
      date: parsed.date,
      odometer: parsed.odometer,
      servicesCount: parsed.services.length,
      total: parsed.total
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        parsed,
        message: 'Successfully parsed maintenance record'
      } as ParseMaintenanceResponse)
    };

  } catch (error) {
    console.error('[ParseMaintenance] Error:', error);

    // Handle rate limit errors
    if (error instanceof Error && error.message.includes('429')) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Rate limit exceeded. Please try again in a few moments.',
          message: 'Too many requests to AI service'
        } as ParseMaintenanceResponse)
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse maintenance record'
      } as ParseMaintenanceResponse)
    };
  }
};
