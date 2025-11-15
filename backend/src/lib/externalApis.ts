/**
 * External API Client Library
 * Handles all third-party vehicle data integrations
 */

import { getParameter, putParameter } from './parameterStore.js';

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
// Vehicle Data Client (Main Class)
// ============================================================================

export class VehicleDataClient {
  private cache = new DataCache();

  /**
   * Decode VIN using NHTSA vPIC API
   * Cache TTL: 30 days (specs don't change)
   */
  async decodeVIN(vin: string): Promise<VehicleSpecs> {
    const cacheKey = `vin/${vin}`;  // Use slash, not colon (AWS Parameter Store restriction)
    const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

    return this.cache.get(
      cacheKey,
      async () => {
        const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `NHTSA vPIC API returned ${response.status}: ${response.statusText}`
          );
        }

        const data = (await response.json()) as VPICResponse;

        if (!data.Results || data.Results.length === 0) {
          throw new Error('No results returned from NHTSA vPIC API');
        }

        const result = data.Results[0];

        // Check for API errors
        if (result.ErrorCode && result.ErrorCode !== '0') {
          throw new Error(
            `NHTSA vPIC Error: ${result.ErrorText || 'Unknown error'}`
          );
        }

        return this.mapVPICResponse(result);
      },
      TTL_SECONDS
    );
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
   * Get vehicle recalls (Phase 2 - placeholder)
   */
  async getRecalls(params: {
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
  }): Promise<Recall[]> {
    // TODO: Implement in Phase 2
    console.log('[VehicleDataClient] getRecalls not yet implemented', params);
    return [];
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
