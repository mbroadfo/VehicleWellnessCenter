/**
 * External API Client Library
 * Handles all third-party vehicle data integrations
 */

import { getParameter, putParameter } from './parameterStore.js';
import { memoryCache } from './cache.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface VehicleSpecs {
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

// ============================================================================
// Caching Infrastructure
// ============================================================================

interface CachedData<T> {
  data: T;
  expiresAt: number;
}

class DataCache {
  private memoryCache = new Map<string, CachedData<unknown>>();

  /**
   * JSON reviver to deserialize Date objects from ISO strings
   */
  private dateReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }
    return value;
  }

  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // Check memory cache first (0-1ms)
    const cached = this.memoryCache.get(key) as CachedData<T> | undefined;
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[Cache HIT] Memory: ${key}`);
      return cached.data;
    }

    // Check Parameter Store cache (50-100ms)
    try {
      const paramValue = await getParameter(`/vwc/cache/${key}`);
      const storedData = JSON.parse(paramValue, this.dateReviver.bind(this)) as CachedData<T>;

      // Refresh memory cache
      this.memoryCache.set(key, storedData);

      if (storedData.expiresAt > Date.now()) {
        console.log(`[Cache HIT] Parameter Store: ${key}`);
        return storedData.data;
      }
    } catch {
      // Cache miss or expired - fetch fresh data
      console.log(`[Cache MISS] ${key}`);
    }

    // Fetch from external API (500-2000ms)
    console.log(`[API CALL] Fetching fresh data for: ${key}`);
    const freshData = await fetcher();
    const cacheEntry: CachedData<T> = {
      data: freshData,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    // Store in both caches
    this.memoryCache.set(key, cacheEntry);

    // Store in Parameter Store (async, don't wait)
    putParameter(`/vwc/cache/${key}`, JSON.stringify(cacheEntry)).catch(
      (err: unknown) => {
        console.error(`[Cache WRITE FAILED] Parameter Store: ${key}`, err);
      }
    );

    return freshData;
  }

  clear() {
    this.memoryCache.clear();
  }
}

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
  private cache = new DataCache();

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

  /**
   * Get fuel economy data (Phase 3 - placeholder)
   */
  async getFuelEconomy(
    year: number,
    make: string,
    model: string
  ): Promise<FuelEconomyData | null> {
    // TODO: Implement in Phase 3
    console.log(
      '[VehicleDataClient] getFuelEconomy not yet implemented',
      year,
      make,
      model
    );
    return null;
  }

  /**
   * Clear all caches (for testing)
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export const vehicleDataClient = new VehicleDataClient();
