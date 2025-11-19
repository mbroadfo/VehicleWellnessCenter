/**
 * POST /vehicles/:id/import-dealer-data
 * 
 * Imports dealer portal data by parsing HTML or analyzing screenshots.
 * User copies/pastes content from their logged-in dealer portal.
 * 
 * Supported Sources:
 * - Mopar (Jeep, Chrysler, Dodge, Ram, Fiat, Alfa Romeo)
 * - GM (Chevrolet, GMC, Buick, Cadillac) - Future
 * - Ford/Lincoln - Future
 * - Toyota/Lexus - Future
 * 
 * Data Types:
 * - Dashboard: Mileage, warranty status, coverage plans, connected services
 * - Recalls: Status updates for existing recalls
 * - Service History: Maintenance records to add as events
 * - Warranty: Detailed coverage information
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../lib/mongodb.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecretsFromParameterStore } from '../lib/parameterStore.js';
import type { DealerPortalData } from '../lib/externalApis.js';

interface ImportRequest {
  source: 'mopar' | 'gm' | 'ford' | 'toyota';
  dataType: 'dashboard' | 'recalls' | 'service_history' | 'warranty';
  content: string; // HTML or base64 screenshot
}

interface ImportResponse {
  success: boolean;
  message: string;
  importedData?: {
    mileage?: number;
    warrantyUpdates?: number;
    coveragePlans?: number;
    serviceRecords?: number;
    recallUpdates?: number;
  };
}

/**
 * Parse Mopar dashboard HTML using Gemini
 */
async function parseMoparDashboard(html: string): Promise<Partial<DealerPortalData>> {
  const secrets = await getSecretsFromParameterStore();
  const apiKey = secrets.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `
You are parsing HTML from a Mopar vehicle dashboard page. Extract the following information:

1. Current Mileage (look for "Mileage: X miles")
2. Warranty Coverage (Basic Limited Warranty with expiration date and mileage)
3. Coverage Plans (e.g., "MOPAR TIRE WORKS" with contract number, dates)
4. Connected Services (e.g., Uconnect status)
5. Safety Recalls (count of incomplete vs complete)

Return JSON:
{
  "mileage": number or null,
  "mileageDate": "ISO date string or null",
  "warranty": {
    "basic": { "expirationDate": "ISO date", "expirationMileage": number, "status": "active" | "expired" }
  },
  "coveragePlans": [
    { "name": "string", "contractNumber": "string", "startDate": "ISO date", "endDate": "ISO date", "type": "tire" | "maintenance" | "other" }
  ],
  "connectedServices": {
    "uconnect": { "status": "active" | "expired" | "unavailable" }
  },
  "recallSummary": {
    "incomplete": number,
    "complete": number
  }
}

HTML Content:
${html.substring(0, 8000)}
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const response = result.response.text();
  const parsed = JSON.parse(response);

  // Convert to DealerPortalData format
  const dealerData: Partial<DealerPortalData> = {
    source: 'mopar',
    lastSync: new Date(),
  };

  if (parsed.mileage) {
    dealerData.mileage = parsed.mileage;
    dealerData.mileageDate = parsed.mileageDate ? new Date(parsed.mileageDate) : new Date();
  }

  if (parsed.warranty) {
    dealerData.warranty = {
      basic: parsed.warranty.basic ? {
        expirationDate: new Date(parsed.warranty.basic.expirationDate),
        expirationMileage: parsed.warranty.basic.expirationMileage,
        status: parsed.warranty.basic.status,
      } : undefined,
    };
  }

  if (parsed.coveragePlans && Array.isArray(parsed.coveragePlans)) {
    dealerData.coveragePlans = parsed.coveragePlans.map((plan: any) => ({
      name: plan.name,
      contractNumber: plan.contractNumber,
      startDate: new Date(plan.startDate),
      endDate: new Date(plan.endDate),
      type: plan.type || 'other',
      details: plan.details,
    }));
  }

  if (parsed.connectedServices) {
    dealerData.connectedServices = parsed.connectedServices;
  }

  return dealerData;
}

/**
 * Parse Mopar service history HTML using Gemini
 */
async function parseMoparServiceHistory(html: string): Promise<any[]> {
  const secrets = await getSecretsFromParameterStore();
  const apiKey = secrets.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `
You are parsing HTML from a Mopar maintenance records page. Extract service records from the table.

Each record should have:
- Date (parse as ISO date string)
- Description (service performed)
- Provider (dealer/shop name)
- Odometer (mileage at time of service)

Return JSON array:
[
  {
    "date": "ISO date string",
    "description": "service description",
    "provider": "provider name",
    "mileage": number
  }
]

HTML Content:
${html.substring(0, 8000)}
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const response = result.response.text();
  const records = JSON.parse(response);

  return Array.isArray(records) ? records : [];
}

/**
 * Main route handler
 */
export async function importDealerDataHandler(
  event: APIGatewayProxyEventV2
): Promise<{ statusCode: number; body: string }> {
  try {
    const vehicleId = event.pathParameters?.vehicleId || event.pathParameters?.id;

    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Vehicle ID required' }),
      };
    }

    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid vehicle ID format' }),
      };
    }

    // Parse request body
    let requestBody: ImportRequest;
    if (event.body) {
      try {
        requestBody = JSON.parse(event.body) as ImportRequest;
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body required' }),
      };
    }

    const { source, dataType, content } = requestBody;

    if (!source || !dataType || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: source, dataType, content' }),
      };
    }

    // Get vehicle from database
    const db = await getDatabase();
    const vehiclesCollection = db.collection('vehicles');

    const vehicle = await vehiclesCollection.findOne({
      _id: new ObjectId(vehicleId),
    });

    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Vehicle not found' }),
      };
    }

    const importedData: ImportResponse['importedData'] = {};

    // Parse based on source and data type
    if (source === 'mopar') {
      if (dataType === 'dashboard') {
        console.log('[Import] Parsing Mopar dashboard...');
        const dealerData = await parseMoparDashboard(content);

        // Update vehicle with dealer portal data
        await vehiclesCollection.updateOne(
          { _id: new ObjectId(vehicleId) },
          {
            $set: {
              'dealerPortal': dealerData,
              lastUpdated: new Date(),
            },
          }
        );

        importedData.mileage = dealerData.mileage ? 1 : 0;
        importedData.warrantyUpdates = dealerData.warranty ? 1 : 0;
        importedData.coveragePlans = dealerData.coveragePlans?.length || 0;

        console.log('[Import] Dashboard data imported successfully');
      } else if (dataType === 'service_history') {
        console.log('[Import] Parsing Mopar service history...');
        const serviceRecords = await parseMoparServiceHistory(content);

        // Add service records as events
        const eventsCollection = db.collection('events');
        const eventDocs = serviceRecords.map((record) => ({
          vehicleId: new ObjectId(vehicleId),
          type: 'service',
          category: 'maintenance',
          date: new Date(record.date),
          mileage: record.mileage,
          description: record.description,
          provider: record.provider,
          source: 'mopar_import',
          importedAt: new Date(),
        }));

        if (eventDocs.length > 0) {
          await eventsCollection.insertMany(eventDocs);
          importedData.serviceRecords = eventDocs.length;
        }

        console.log(`[Import] Imported ${eventDocs.length} service records`);
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Source '${source}' not yet supported` }),
      };
    }

    const response: ImportResponse = {
      success: true,
      message: `Successfully imported ${dataType} data from ${source}`,
      importedData,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('[Import] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to import dealer data', details: errorMessage }),
    };
  }
}
