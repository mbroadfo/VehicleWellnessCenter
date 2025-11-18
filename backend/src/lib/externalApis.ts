/**
 * External API Client Library
 * Handles all third-party vehicle data integrations
 */

import { XMLParser } from 'fast-xml-parser';
import { memoryCache } from './cache.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface VehicleSpecs {
  // Core vehicle identification
  year: number;
  make: string;
  model: string;
  trim?: string;
  
  engine: {
    cylinders: number;
    displacement: number; // Liters
    fuelType: string;
    horsepower?: number;
    manufacturer?: string;
  };
  body: {
    type: string; // Sedan, SUV, Truck, Coupe, etc.
    doors: number;
    style?: string;
  };
  safety: {
    airbags?: number;
    abs?: boolean;
    esc?: boolean; // Electronic Stability Control
  };
  transmission?: {
    type: string; // Automatic, Manual, CVT, etc.
    speeds?: number;
  };
  weights?: {
    gvwr?: number; // Gross Vehicle Weight Rating (lbs)
    curb?: number; // Curb weight (lbs)
  };
  decodedAt: Date;
  source: 'NHTSA_vPIC';
}

export interface RecallData {
  manufacturer: string;
  NHTSACampaignNumber: string;
  reportReceivedDate: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  notes: string;
  modelYear: string;
  make: string;
  model: string;
}

export interface ComplaintData {
  odiNumber: number;
  manufacturer: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  dateOfIncident: string;
  dateComplaintFiled: string;
  vin: string;
  components: string;
  summary: string;
}

export interface SafetyData {
  recalls: RecallData[];
  complaints: ComplaintData[];
  lastChecked: Date;
}

export interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  announcedDate: Date;
  status: 'open' | 'completed';
}

export interface FuelEconomyData {
  epa: {
    city: number;
    highway: number;
    combined: number;
    annualFuelCost: number;
    co2: number; // grams/mile
  };
  lastUpdated: Date;
}

export interface EPAVehicleMatch {
  epaId: number;
  description: string; // e.g., "Auto 9-spd, 6 cyl, 3.2 L"
}

// ============================================================================
// Caching Infrastructure
// ============================================================================




// ============================================================================
// External API Error Handling
// ============================================================================

export class ExternalAPIError extends Error {
  constructor(
    public service: string,
    public originalError: Error,
    public fallbackAvailable: boolean
  ) {
    super(`${service} API failed: ${originalError.message}`);
    this.name = 'ExternalAPIError';
  }
}

// ============================================================================
// NHTSA vPIC API Client
// ============================================================================

interface VPICResponse {
  Results: Array<{
    // Core identification
    VIN?: string;
    Make?: string;
    Model?: string;
    ModelYear?: string;
    Trim?: string;

    // Engine
    EngineCylinders?: string;
    DisplacementL?: string;
    FuelTypePrimary?: string;
    EngineHP?: string;
    EngineManufacturer?: string;

    // Body
    BodyClass?: string;
    Doors?: string;

    // Transmission
    TransmissionStyle?: string;
    TransmissionSpeeds?: string;

    // Safety
    AirBagLocCurtain?: string;
    ABS?: string;
    ESC?: string;

    // Weights
    GVWR?: string;
    CurbWeightLB?: string;

    // Error handling
    ErrorCode?: string;
    ErrorText?: string;
  }>;
}

// ============================================================================
// NHTSA Recalls & Complaints API Client
// ============================================================================

interface RecallsAPIResponse {
  Count: number;
  Message: string;
  results: Array<{
    Manufacturer: string;
    NHTSACampaignNumber: string;
    parkIt: boolean;
    parkOutSide: boolean;
    overTheAirUpdate: boolean;
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Consequence: string;
    Remedy: string;
    Notes: string;
    ModelYear: string;
    Make: string;
    Model: string;
  }>;
}

interface ComplaintsAPIResponse {
  Count: number;
  Message: string;
  results: Array<{
    odiNumber: number;
    manufacturer: string;
    crash: boolean;
    fire: boolean;
    numberOfInjuries: number;
    numberOfDeaths: number;
    dateOfIncident: string;
    dateComplaintFiled: string;
    vin: string;
    components: string;
    summary: string;
    products: Array<{
      type: string;
      productYear: string;
      productMake: string;
      productModel: string;
      manufacturer: string;
    }>;
  }>;
}

// ============================================================================
// Vehicle Data Client (Main Class)
// ============================================================================

export class VehicleDataClient {
  // DataCache removed; use memoryCache directly

  /**
   * Decode VIN using NHTSA vPIC API
   * Cache TTL: 30 days (specs don't change)
   */
  async decodeVIN(vin: string): Promise<VehicleSpecs> {
    const cacheKey = `vin:${vin}`;

    // Check memory cache (Lambda container reuse)
    const cached = memoryCache.get<VehicleSpecs>(cacheKey);
    if (cached) return cached;

    // Fetch from NHTSA vPIC API
    console.log(`[VIN Decode] Fetching specs for VIN: ${vin}`);
    const specs = await this.fetchVPICData(vin);

    // Cache in memory for 24 hours (Lambda container lifetime)
    memoryCache.set(cacheKey, specs, 24 * 60 * 60);

    return specs;
    // Note: Caller (enrichVehicle route) stores in MongoDB vehicle.specs permanently
  }

  /**
   * Fetch vehicle specs from NHTSA vPIC API
   */
  private async fetchVPICData(vin: string): Promise<VehicleSpecs> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new ExternalAPIError(
        'NHTSA vPIC',
        new Error(`HTTP ${response.status}: ${response.statusText}`),
        false
      );
    }

    const data = (await response.json()) as VPICResponse;

    if (!data.Results || data.Results.length === 0) {
      throw new ExternalAPIError(
        'NHTSA vPIC',
        new Error('No results returned from API'),
        false
      );
    }

    const result = data.Results[0];

    // Check for API errors
    if (result.ErrorCode && result.ErrorCode !== '0') {
      throw new ExternalAPIError(
        'NHTSA vPIC',
        new Error(result.ErrorText || 'Unknown error'),
        false
      );
    }

    return this.mapVPICResponse(result);
  }

  /**
   * Map NHTSA vPIC response to our VehicleSpecs format
   */
  private mapVPICResponse(result: VPICResponse['Results'][0]): VehicleSpecs {
    const specs: VehicleSpecs = {
      // Core vehicle identification
      year: parseInt(result.ModelYear || '0') || 0,
      make: result.Make || 'Unknown',
      model: result.Model || 'Unknown',
      trim: result.Trim || undefined,
      
      engine: {
        cylinders: parseInt(result.EngineCylinders || '0') || 0,
        displacement: parseFloat(result.DisplacementL || '0') || 0,
        fuelType: result.FuelTypePrimary || 'Unknown',
        horsepower: result.EngineHP ? parseInt(result.EngineHP) : undefined,
        manufacturer: result.EngineManufacturer || undefined,
      },
      body: {
        type: result.BodyClass || 'Unknown',
        doors: parseInt(result.Doors || '0') || 0,
      },
      safety: {
        abs: result.ABS ? result.ABS.toLowerCase().includes('yes') : undefined,
        esc: result.ESC ? result.ESC.toLowerCase().includes('yes') : undefined,
      },
      transmission: result.TransmissionStyle
        ? {
            type: result.TransmissionStyle,
            speeds: result.TransmissionSpeeds
              ? parseInt(result.TransmissionSpeeds)
              : undefined,
          }
        : undefined,
      weights: {
        gvwr: result.GVWR ? parseInt(result.GVWR) : undefined,
        curb: result.CurbWeightLB ? parseInt(result.CurbWeightLB) : undefined,
      },
      decodedAt: new Date(),
      source: 'NHTSA_vPIC',
    };

    return specs;
  }

  /**
   * Get vehicle recalls from NHTSA API
   * Cache TTL: 7 days (recalls change occasionally)
   */
  async getRecalls(
    make: string,
    model: string,
    year: number
  ): Promise<RecallData[]> {
    const cacheKey = `recalls:${make}:${model}:${year}`;
    const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

    // Check memory cache
    const cached = memoryCache.get<RecallData[]>(cacheKey);
    if (cached) return cached;

    // Fetch from NHTSA Recalls API
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new ExternalAPIError(
        'NHTSA Recalls',
        new Error(`HTTP ${response.status}: ${response.statusText}`),
        false
      );
    }

    const data = (await response.json()) as RecallsAPIResponse;
    if (!data.results) {
      throw new ExternalAPIError(
        'NHTSA Recalls',
        new Error('No results returned from NHTSA Recalls API'),
        false
      );
    }

    // Map API response to our format
    const recalls = data.results.map((recall) => ({
      manufacturer: recall.Manufacturer,
      NHTSACampaignNumber: recall.NHTSACampaignNumber,
      reportReceivedDate: recall.ReportReceivedDate,
      component: recall.Component,
      summary: recall.Summary,
      consequence: recall.Consequence,
      remedy: recall.Remedy,
      notes: recall.Notes,
      modelYear: recall.ModelYear,
      make: recall.Make,
      model: recall.Model,
    }));

    // Cache in memory for 7 days
    memoryCache.set(cacheKey, recalls, TTL_SECONDS);
    return recalls;
  }

  /**
   * Get vehicle complaints from NHTSA API
   * Cache TTL: 30 days (complaints are historical data)
   */
  async getComplaints(
    make: string,
    model: string,
    year: number
  ): Promise<ComplaintData[]> {
    const cacheKey = `complaints:${make}:${model}:${year}`;
    const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

    // Check memory cache
    const cached = memoryCache.get<ComplaintData[]>(cacheKey);
    if (cached) return cached;

    // Fetch from NHTSA Complaints API
    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new ExternalAPIError(
        'NHTSA Complaints',
        new Error(`HTTP ${response.status}: ${response.statusText}`),
        false
      );
    }

    const data = (await response.json()) as ComplaintsAPIResponse;
    if (!data.results) {
      throw new ExternalAPIError(
        'NHTSA Complaints',
        new Error('No results returned from NHTSA Complaints API'),
        false
      );
    }

    // Map API response to our format
    const complaints = data.results.map((complaint) => ({
      odiNumber: complaint.odiNumber,
      manufacturer: complaint.manufacturer,
      crash: complaint.crash,
      fire: complaint.fire,
      numberOfInjuries: complaint.numberOfInjuries,
      numberOfDeaths: complaint.numberOfDeaths,
      dateOfIncident: complaint.dateOfIncident,
      dateComplaintFiled: complaint.dateComplaintFiled,
      vin: complaint.vin,
      components: complaint.components,
      summary: complaint.summary,
    }));

    // Cache in memory for 30 days
    memoryCache.set(cacheKey, complaints, TTL_SECONDS);
    return complaints;
  }

  // ============================================================================
  // EPA Fuel Economy API Client
  // ============================================================================

  private xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  /**
   * Search EPA database for vehicles matching year/make/model
   * Returns all matching vehicle IDs with engine/transmission descriptions
   * Cache TTL: 24 hours (model lineup doesn't change frequently)
   */
  async searchEPAVehicle(
    year: number,
    make: string,
    model: string
  ): Promise<EPAVehicleMatch[]> {
    const cacheKey = `epa:search:${year}:${make}:${model}`;
    const TTL_SECONDS = 24 * 60 * 60; // 24 hours

    // Check memory cache
    const cached = memoryCache.get<EPAVehicleMatch[]>(cacheKey);
    if (cached) return cached;

    console.log(`[EPA Search] Looking for ${year} ${make} ${model}`);

    try {
      // Step 1: Get all models for this year/make
      const modelsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`;
      const modelsResponse = await fetch(modelsUrl);
      if (!modelsResponse.ok) {
        throw new Error(`EPA Models API: HTTP ${modelsResponse.status}`);
      }

      const modelsXml = await modelsResponse.text();
      const modelsData = this.xmlParser.parse(modelsXml);

      // Parse model list from XML structure: menuItems -> menuItem[]
      const menuItems = modelsData?.menuItems?.menuItem;
      if (!menuItems) {
        console.log(`[EPA Search] No models found for ${year} ${make}`);
        return [];
      }

      // Convert to array if single result
      const modelList = Array.isArray(menuItems) ? menuItems : [menuItems];

      // Find models that match (case-insensitive, partial match)
      const matchingModels = modelList.filter((item: { text?: string; value?: string }) => {
        const modelName = item.text || item.value || '';
        return modelName.toLowerCase().includes(model.toLowerCase());
      });

      if (matchingModels.length === 0) {
        console.log(`[EPA Search] No matching models for "${model}" in ${year} ${make}`);
        return [];
      }

      console.log(`[EPA Search] Found ${matchingModels.length} matching model(s)`);

      // Step 2: Get vehicle options (engine/transmission variants) for each matching model
      const allMatches: EPAVehicleMatch[] = [];

      for (const modelItem of matchingModels) {
        const modelName = modelItem.text || modelItem.value;
        const optionsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(modelName)}`;

        const optionsResponse = await fetch(optionsUrl);
        if (!optionsResponse.ok) {
          console.warn(`[EPA Search] Failed to get options for ${modelName}: HTTP ${optionsResponse.status}`);
          continue;
        }

        const optionsXml = await optionsResponse.text();
        const optionsData = this.xmlParser.parse(optionsXml);

        const optionItems = optionsData?.menuItems?.menuItem;
        if (!optionItems) continue;

        const optionList = Array.isArray(optionItems) ? optionItems : [optionItems];

        // Each option is a vehicle variant with EPA ID
        for (const option of optionList) {
          if (option.value) {
            allMatches.push({
              epaId: parseInt(option.value),
              description: option.text || `${modelName} (ID: ${option.value})`,
            });
          }
        }
      }

      console.log(`[EPA Search] Found ${allMatches.length} vehicle variant(s)`);

      // Cache results
      memoryCache.set(cacheKey, allMatches, TTL_SECONDS);
      return allMatches;
    } catch (error) {
      console.error('[EPA Search] Error:', error);
      throw new ExternalAPIError(
        'EPA Vehicle Search',
        error instanceof Error ? error : new Error(String(error)),
        false
      );
    }
  }

  /**
   * Get fuel economy data for a specific EPA vehicle ID
   * Cache TTL: Permanent (EPA ratings are immutable once published)
   */
  async getFuelEconomy(epaId: number): Promise<FuelEconomyData> {
    const cacheKey = `epa:fuel:${epaId}`;
    const TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year (effectively permanent)

    // Check memory cache
    const cached = memoryCache.get<FuelEconomyData>(cacheKey);
    if (cached) return cached;

    console.log(`[EPA Fuel Economy] Fetching data for EPA ID: ${epaId}`);

    try {
      const url = `https://www.fueleconomy.gov/ws/rest/vehicle/${epaId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`EPA Vehicle API: HTTP ${response.status}`);
      }

      const xml = await response.text();
      const data = this.xmlParser.parse(xml);

      const vehicle = data?.vehicle;
      if (!vehicle) {
        throw new Error('Invalid EPA vehicle data structure');
      }

      // Extract fuel economy fields (EPA uses "08" suffix for current test cycle)
      const fuelEconomyData: FuelEconomyData = {
        epa: {
          city: parseInt(vehicle.city08) || 0,
          highway: parseInt(vehicle.highway08) || 0,
          combined: parseInt(vehicle.comb08) || 0,
          annualFuelCost: parseInt(vehicle.fuelCost08) || 0,
          co2: parseFloat(vehicle.co2TailpipeGpm) || 0,
        },
        lastUpdated: new Date(),
      };

      // Cache permanently (EPA ratings don't change)
      memoryCache.set(cacheKey, fuelEconomyData, TTL_SECONDS);
      return fuelEconomyData;
    } catch (error) {
      console.error('[EPA Fuel Economy] Error:', error);
      throw new ExternalAPIError(
        'EPA Fuel Economy',
        error instanceof Error ? error : new Error(String(error)),
        false
      );
    }
  }

  /**
   * Smart matching: Find best EPA vehicle match using NHTSA specs
   * Filters by engine specs (cylinders, displacement) if available
   */
  async matchVehicleToEPA(
    year: number,
    make: string,
    model: string,
    cylinders?: number,
    displacement?: number
  ): Promise<number | null> {
    console.log('[EPA Match] Searching for:', { year, make, model, cylinders, displacement });

    // Get all EPA matches for this vehicle
    const matches = await this.searchEPAVehicle(year, make, model);

    if (matches.length === 0) {
      console.log('[EPA Match] No EPA vehicles found');
      return null;
    }

    // If only one match, return it
    if (matches.length === 1) {
      console.log(`[EPA Match] Single match found: EPA ID ${matches[0].epaId}`);
      return matches[0].epaId;
    }

    // Multiple matches - try to filter by engine specs
    console.log(`[EPA Match] ${matches.length} matches found, filtering by engine specs`);

    // Filter by cylinders if available
    let filtered = matches;
    if (cylinders) {
      const cylinderMatches = matches.filter((m) =>
        m.description.toLowerCase().includes(`${cylinders} cyl`)
      );
      if (cylinderMatches.length > 0) {
        filtered = cylinderMatches;
        console.log(`[EPA Match] Filtered to ${filtered.length} matches by cylinders`);
      }
    }

    // Filter by displacement if available
    if (displacement && filtered.length > 1) {
      const displacementStr = displacement.toFixed(1); // e.g., "3.2"
      const displacementMatches = filtered.filter((m) =>
        m.description.includes(`${displacementStr} L`)
      );
      if (displacementMatches.length > 0) {
        filtered = displacementMatches;
        console.log(`[EPA Match] Filtered to ${filtered.length} matches by displacement`);
      }
    }

    // Return first match (or null if filtering eliminated everything)
    if (filtered.length > 0) {
      console.log(`[EPA Match] Selected EPA ID ${filtered[0].epaId}: ${filtered[0].description}`);
      return filtered[0].epaId;
    }

    // Fallback: return first match if filtering failed
    console.log(`[EPA Match] Filtering failed, using first match: EPA ID ${matches[0].epaId}`);
    return matches[0].epaId;
  }

  /**
   * Clear all caches (for testing)
   */
  clearCache() {
    memoryCache.clear();
  }
}

// Export singleton instance
export const vehicleDataClient = new VehicleDataClient();
