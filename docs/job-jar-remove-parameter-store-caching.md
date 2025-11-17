# External API Caching Migration Plan

**Date:** November 16, 2025  
**Status:** Planning  
**Goal:** Remove Parameter Store from external API caching, implement MongoDB-based strategy

---

## Problem Statement

Current implementation uses Parameter Store for external API caching (VIN decode, recalls, complaints). This approach has several issues:

1. **Size Limits**: Safety data exceeds Parameter Store limits (4KB/32KB)
2. **Wrong Use Case**: Parameter Store is for secrets/auth, not application data
3. **Complexity**: Unnecessary IAM permissions and error handling
4. **Test Pollution**: Cache persists between test runs
5. **Not Vehicle-Scoped**: Would need complex key management

**Evidence from tests:**
```
[Cache WRITE FAILED] Parameter Store: recalls/Jeep/Cherokee/2017 
Error: Standard tier parameters support a maximum parameter value of 4096 characters

[Cache WRITE FAILED] Parameter Store: complaints/Jeep/Cherokee/2017
Error: Value at 'value' failed to satisfy constraint: Member must have length 
less than or equal to 32768
```

---

## Target Architecture

### Cache Strategy by Data Type

| Data Source | Storage | TTL | Rationale |
|-------------|---------|-----|-----------|
| VIN Specs (immutable) | MongoDB `vehicle.specs` | None | Decode once, store forever |
| Recalls (mutable) | MongoDB `vehicle.safety.recalls` | 7 days | Refresh weekly |
| Complaints (mutable) | MongoDB `vehicle.safety.complaints` | 30 days | Refresh monthly |
| Memory Cache | Lambda container | 1 hour | Hot path optimization |

### MongoDB Document Structure

```typescript
interface Vehicle {
  _id: ObjectId;
  vin: string;
  make: string;
  model: string;
  year: number;
  
  // VIN decode results (stored once, never expires)
  specs?: {
    engine: { ... };
    body: { ... };
    safety: { ... };
    transmission?: { ... };
    decodedAt: Date;
    source: 'NHTSA_vPIC';
  };
  
  // Safety data (refreshed based on TTL)
  safety?: {
    recalls: RecallData[];
    complaints: ComplaintData[];
    lastChecked: Date;  // TTL tracking
  };
}
```

### New Caching Flow

**VIN Decode:**
```
1. Check memory cache (Lambda container)
2. If miss: Call NHTSA API
3. Cache in memory (1 hour)
4. Store in MongoDB vehicle.specs (forever)
```

**Safety Data:**
```
1. Check memory cache (Lambda container)
2. If miss: Query MongoDB for vehicle.safety
3. Check TTL (7 days for recalls, 30 days for complaints)
4. If expired: Call NHTSA APIs, update MongoDB
5. Cache in memory (1 hour)
6. Return data
```

---

## Migration Tasks

### Phase 1: Create Memory Cache Utility (30 min)

**File:** `backend/src/lib/cache.ts`

```typescript
/**
 * Memory-only cache for Lambda container optimization
 * Survives across invocations within same container (~15-45 min)
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      console.log(`[Memory Cache MISS] ${key}`);
      return null;
    }
    
    if (entry.expiresAt < Date.now()) {
      console.log(`[Memory Cache EXPIRED] ${key}`);
      this.cache.delete(key);
      return null;
    }
    
    console.log(`[Memory Cache HIT] ${key}`);
    return entry.data;
  }
  
  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    console.log(`[Memory Cache SET] ${key} (TTL: ${ttlSeconds}s)`);
  }
  
  delete(key: string): void {
    this.cache.delete(key);
    console.log(`[Memory Cache DELETE] ${key}`);
  }
  
  clear(): void {
    this.cache.clear();
    console.log('[Memory Cache CLEARED]');
  }
  
  size(): number {
    return this.cache.size;
  }
}

// Singleton instance (survives across Lambda invocations)
export const memoryCache = new MemoryCache();
```

**Tasks:**
- [ ] Create `backend/src/lib/cache.ts`
- [ ] Add unit tests in `backend/src/lib/cache.test.ts`
- [ ] Test expiration logic
- [ ] Test clear() for test utilities

**Test Strategy:**
```typescript
describe('MemoryCache', () => {
  it('should return null on cache miss', () => {
    const cache = new MemoryCache();
    expect(cache.get('nonexistent')).toBeNull();
  });
  
  it('should return cached data on hit', () => {
    const cache = new MemoryCache();
    cache.set('key1', { value: 'test' }, 60);
    expect(cache.get('key1')).toEqual({ value: 'test' });
  });
  
  it('should expire data after TTL', async () => {
    const cache = new MemoryCache();
    cache.set('key1', 'data', 1); // 1 second TTL
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cache.get('key1')).toBeNull();
  });
});
```

---

### Phase 2: Refactor VIN Decode (1 hour)

**File:** `backend/src/lib/externalApis.ts`

**Current (with Parameter Store):**
```typescript
async decodeVIN(vin: string): Promise<VehicleSpecs> {
  return this.cache.get(  // DataCache uses Parameter Store
    `vin/${vin}`,
    () => this.fetchVPICData(vin),
    30 * 24 * 60 * 60  // 30 days
  );
}
```

**Target (memory-only):**
```typescript
async decodeVIN(vin: string): Promise<VehicleSpecs> {
  const cacheKey = `vin:${vin}`;
  
  // Check memory cache
  const cached = memoryCache.get<VehicleSpecs>(cacheKey);
  if (cached) return cached;
  
  // Fetch from NHTSA API
  console.log(`[VIN Decode] Fetching specs for VIN: ${vin}`);
  const specs = await this.fetchVPICData(vin);
  
  // Cache in memory for 24 hours (Lambda container reuse)
  memoryCache.set(cacheKey, specs, 24 * 60 * 60);
  
  return specs;
  // Note: Caller stores in MongoDB vehicle.specs
}

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
  
  const data = await response.json();
  return this.mapVPICResponse(data.Results[0]);
}
```

**Tasks:**
- [ ] Remove `DataCache` usage from `decodeVIN()`
- [ ] Replace with `memoryCache`
- [ ] Update `enrichVehicle.ts` to store specs in MongoDB
- [ ] Remove Parameter Store import if no longer needed
- [ ] Update tests to not expect Parameter Store

**MongoDB Storage (in enrichVehicle route):**
```typescript
// After decoding VIN
const specs = await vehicleDataClient.decodeVIN(vin);

// Store in MongoDB
await vehicles.updateOne(
  { _id: vehicleId },
  {
    $set: {
      specs: specs,
      make: specs.make,   // Also update top-level fields
      model: specs.model,
      year: specs.year
    }
  }
);
```

---

### Phase 3: Refactor Safety Data APIs (1.5 hours)

**File:** `backend/src/lib/externalApis.ts`

**Current (with Parameter Store):**
```typescript
async getRecalls(make: string, model: string, year: number): Promise<RecallData[]> {
  return this.cache.get(
    `recalls/${make}/${model}/${year}`,
    () => this.fetchRecallsData(make, model, year),
    7 * 24 * 60 * 60  // 7 days
  );
}
```

**Target (memory-only, MongoDB TTL handled by route):**
```typescript
async getRecalls(make: string, model: string, year: number): Promise<RecallData[]> {
  const cacheKey = `recalls:${make}:${model}:${year}`;
  
  // Check memory cache
  const cached = memoryCache.get<RecallData[]>(cacheKey);
  if (cached) return cached;
  
  // Fetch from NHTSA API
  console.log(`[Recalls API] Fetching recalls for ${year} ${make} ${model}`);
  const recalls = await this.fetchRecallsData(make, model, year);
  
  // Cache in memory for 1 hour (Lambda container reuse)
  memoryCache.set(cacheKey, recalls, 60 * 60);
  
  return recalls;
  // Note: Route handler stores in MongoDB with lastChecked timestamp
}

async getComplaints(make: string, model: string, year: number): Promise<ComplaintData[]> {
  const cacheKey = `complaints:${make}:${model}:${year}`;
  
  // Check memory cache
  const cached = memoryCache.get<ComplaintData[]>(cacheKey);
  if (cached) return cached;
  
  // Fetch from NHTSA API
  console.log(`[Complaints API] Fetching complaints for ${year} ${make} ${model}`);
  const complaints = await this.fetchComplaintsData(make, model, year);
  
  // Cache in memory for 1 hour
  memoryCache.set(cacheKey, complaints, 60 * 60);
  
  return complaints;
}
```

**Tasks:**
- [ ] Remove `DataCache` usage from `getRecalls()`
- [ ] Remove `DataCache` usage from `getComplaints()`
- [ ] Replace with `memoryCache`
- [ ] Keep existing `fetchRecallsData()` and `fetchComplaintsData()` private methods
- [ ] Update tests to not expect Parameter Store

---

### Phase 4: Update Safety Endpoint with MongoDB TTL (1.5 hours)

**File:** `backend/src/routes/getVehicleSafety.ts`

**Current (no MongoDB persistence):**
```typescript
// Just calls API and returns
const [recalls, complaints] = await Promise.all([
  vehicleDataClient.getRecalls(vehicle.make, vehicle.model, vehicle.year),
  vehicleDataClient.getComplaints(vehicle.make, vehicle.model, vehicle.year)
]);
```

**Target (MongoDB with TTL checking):**
```typescript
export async function getVehicleSafetyHandler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    const vehicleId = event.pathParameters?.id;
    
    if (!vehicleId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Missing vehicle ID'
        })
      };
    }
    
    if (!ObjectId.isValid(vehicleId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Invalid vehicle ID format'
        })
      };
    }
    
    // Fetch vehicle
    const db = await getDatabase();
    const vehicles = db.collection('vehicles');
    const vehicle = await vehicles.findOne({ _id: new ObjectId(vehicleId) });
    
    if (!vehicle) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle not found'
        })
      };
    }
    
    // Validate required fields
    if (!vehicle.make || !vehicle.model || !vehicle.year) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Vehicle missing required fields (make, model, year)'
        })
      };
    }
    
    // Check if we need to refresh safety data (7-day TTL)
    const SAFETY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const needsRefresh = !vehicle.safety?.lastChecked ||
                         (Date.now() - vehicle.safety.lastChecked.getTime()) > SAFETY_TTL;
    
    let recalls: RecallData[];
    let complaints: ComplaintData[];
    let lastChecked: Date;
    
    if (needsRefresh) {
      console.log(`[Safety TTL] Expired for vehicle ${vehicleId}, fetching fresh data`);
      
      // Fetch fresh data from APIs
      try {
        [recalls, complaints] = await Promise.all([
          vehicleDataClient.getRecalls(vehicle.make, vehicle.model, vehicle.year),
          vehicleDataClient.getComplaints(vehicle.make, vehicle.model, vehicle.year)
        ]);
        
        lastChecked = new Date();
        
        // Update MongoDB with fresh data
        await vehicles.updateOne(
          { _id: new ObjectId(vehicleId) },
          {
            $set: {
              'safety.recalls': recalls,
              'safety.complaints': complaints,
              'safety.lastChecked': lastChecked
            }
          }
        );
        
        console.log(`[Safety TTL] Updated MongoDB for vehicle ${vehicleId}`);
      } catch (error) {
        if (error instanceof ExternalAPIError) {
          return {
            statusCode: 502,
            body: JSON.stringify({
              success: false,
              error: `External API error: ${error.service}`,
              details: error.message
            })
          };
        }
        throw error;
      }
    } else {
      // Use cached data from MongoDB
      console.log(`[Safety TTL] Using cached data for vehicle ${vehicleId}`);
      recalls = vehicle.safety.recalls;
      complaints = vehicle.safety.complaints;
      lastChecked = vehicle.safety.lastChecked;
    }
    
    // Calculate summary statistics
    const summary = {
      totalRecalls: recalls.length,
      totalComplaints: complaints.length,
      hasActiveRecalls: recalls.length > 0,
      complaintsWithInjuries: complaints.filter(c => c.numberOfInjuries > 0).length,
      complaintsWithDeaths: complaints.filter(c => c.numberOfDeaths > 0).length,
      complaintsWithFire: complaints.filter(c => c.fire).length,
      complaintsWithCrash: complaints.filter(c => c.crash).length
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        vehicle: {
          id: vehicleId,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          vin: vehicle.vin
        },
        safety: {
          recalls,
          complaints,
          lastChecked
        },
        summary
      })
    };
  } catch (error) {
    console.error('Safety endpoint error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
}
```

**Tasks:**
- [ ] Add TTL checking logic
- [ ] Add MongoDB update operation for safety data
- [ ] Include `lastChecked` in response
- [ ] Update error handling for MongoDB operations
- [ ] Test TTL expiration behavior

---

### Phase 5: Remove DataCache Class (30 min)

**File:** `backend/src/lib/externalApis.ts`

**Current:**
```typescript
class DataCache {
  private memoryCache = new Map<string, CachedData<unknown>>();
  
  async get<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    // Memory cache check
    // Parameter Store check
    // API call fallback
    // Store in both caches
  }
}

const cache = new DataCache();
```

**Target:**
```typescript
// Remove DataCache class entirely
// Remove Parameter Store imports (getParameter, putParameter)
// VehicleDataClient uses memoryCache directly
```

**Tasks:**
- [ ] Delete `DataCache` class definition
- [ ] Remove `cache` instance
- [ ] Remove `getParameter` and `putParameter` imports
- [ ] Ensure no references remain
- [ ] Run TypeScript compilation to verify

---

### Phase 6: Update Tests (1 hour)

**File:** `backend/src/vehicleSafety.test.ts`

**Changes needed:**
1. Remove expectations of Parameter Store writes
2. Add MongoDB assertions
3. Test TTL expiration logic
4. Clear memory cache between tests

**Test Updates:**

```typescript
import { memoryCache } from './lib/cache';

beforeEach(() => {
  // Clear memory cache before each test
  memoryCache.clear();
});

describe('NHTSA Recalls API', () => {
  it('should fetch recalls for 2017 Jeep Cherokee', async () => {
    // Clear cache to ensure fresh API call
    memoryCache.clear();
    
    const recalls = await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);
    
    expect(recalls).toBeDefined();
    expect(Array.isArray(recalls)).toBe(true);
    expect(recalls.length).toBeGreaterThan(0);
    
    // Verify recall structure (same as before)
    const firstRecall = recalls[0];
    expect(firstRecall).toHaveProperty('NHTSACampaignNumber');
    // ... rest of assertions
  });
  
  it('should cache recalls data in memory', async () => {
    // First call
    const recalls1 = await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);
    
    // Second call (should hit memory cache)
    const start = Date.now();
    const recalls2 = await vehicleDataClient.getRecalls('Jeep', 'Cherokee', 2017);
    const duration = Date.now() - start;
    
    // Memory cache should be instant (<10ms)
    expect(duration).toBeLessThan(10);
    expect(recalls2).toEqual(recalls1);
  });
});

describe('GET /vehicles/:id/safety endpoint', () => {
  it('should store safety data in MongoDB', async () => {
    const event: Partial<APIGatewayProxyEventV2> = {
      pathParameters: { id: TEST_VEHICLE_ID.toString() }
    };
    
    const response = await getVehicleSafetyHandler(event as APIGatewayProxyEventV2);
    expect(response.statusCode).toBe(200);
    
    // Verify MongoDB was updated
    const db = await getDatabase();
    const vehicle = await db.collection('vehicles').findOne({ _id: TEST_VEHICLE_ID });
    
    expect(vehicle?.safety).toBeDefined();
    expect(vehicle?.safety?.recalls).toBeDefined();
    expect(vehicle?.safety?.complaints).toBeDefined();
    expect(vehicle?.safety?.lastChecked).toBeInstanceOf(Date);
  });
  
  it('should use cached MongoDB data within TTL', async () => {
    // First call - populates MongoDB
    await getVehicleSafetyHandler({ pathParameters: { id: TEST_VEHICLE_ID.toString() } } as any);
    
    // Second call - should use MongoDB cache
    const start = Date.now();
    await getVehicleSafetyHandler({ pathParameters: { id: TEST_VEHICLE_ID.toString() } } as any);
    const duration = Date.now() - start;
    
    // Should be fast (MongoDB read + no API calls)
    expect(duration).toBeLessThan(100);
  });
});
```

**Other test files:**
- [ ] Update `enrichVehicle.test.ts` - remove Parameter Store expectations
- [ ] Update cache timing tests - expect memory cache only
- [ ] Remove any Parameter Store cleanup in afterAll()

---

### Phase 7: Infrastructure Cleanup (30 min)

**File:** `infra/terraform-vwc-core-policy-updated.json`

**Current IAM Policy includes:**
```json
{
  "Effect": "Allow",
  "Action": [
    "ssm:GetParameter",
    "ssm:PutParameter",
    "ssm:DeleteParameter"
  ],
  "Resource": "arn:aws:ssm:us-west-2:*:parameter/vwc/*"
}
```

**Target (keep for secrets, remove cache paths):**
```json
{
  "Effect": "Allow",
  "Action": [
    "ssm:GetParameter",
    "ssm:PutParameter"
  ],
  "Resource": [
    "arn:aws:ssm:us-west-2:*:parameter/vwc/dev/secrets",
    "arn:aws:ssm:us-west-2:*:parameter/vwc/dev/auth0-token-cache"
  ]
}
```

**Tasks:**
- [ ] Update IAM policy to restrict Parameter Store to secrets and auth tokens
- [ ] Remove `/vwc/cache/*` permission (no longer needed)
- [ ] Update Terraform configuration if needed
- [ ] Apply Terraform changes
- [ ] Verify Lambda still has access to secrets and auth cache

**Terraform (if Parameter Store cache resources exist):**
- [ ] Remove any `aws_ssm_parameter` resources for cache paths
- [ ] Keep `aws_ssm_parameter.auth0_token_cache`
- [ ] Update documentation

---

### Phase 8: Documentation Updates (30 min)

**Files to update:**

1. **`backend/README.md`**
   - Document memory cache usage
   - Document MongoDB TTL pattern
   - Remove Parameter Store cache references
   - Add cache clearing for tests

2. **`docs/data-model.md`**
   - Add `vehicle.safety` schema
   - Document `lastChecked` TTL field
   - Add example vehicle document with safety data

3. **`docs/external-api-caching-strategy.md`**
   - Already created! ✅
   - Reference this as the source of truth

4. **`.github/copilot-instructions.md`**
   - Update caching rules:
     ```
     - Parameter Store: Only for secrets and Auth0 token caching
     - External API caching: Memory (Lambda container) + MongoDB (persistence with TTL)
     - VIN decode: Store in vehicle.specs, no expiration
     - Safety data: Store in vehicle.safety, 7-day TTL
     ```

5. **`CHANGELOG.md`**
   - Document this migration in Phase 2 notes
   - Explain why Parameter Store removed
   - List benefits (simpler, no size limits, persistent)

**Tasks:**
- [ ] Update all documentation files
- [ ] Add migration notes to CHANGELOG
- [ ] Update copilot instructions
- [ ] Commit documentation separately

---

### Phase 9: Deploy and Verify (30 min)

**Deployment:**
```bash
# Run all tests
npm test

# Build Lambda
npm run build:lambda

# Deploy
npm run deploy
```

**Verification:**
1. **Test VIN decode:**
   - Call enrichVehicle endpoint
   - Verify vehicle.specs stored in MongoDB
   - Check CloudWatch logs for memory cache hits

2. **Test safety data:**
   - Call getVehicleSafety endpoint
   - Verify vehicle.safety stored in MongoDB with lastChecked
   - Call again, verify MongoDB cache used (no API calls)
   - Check CloudWatch logs

3. **Monitor:**
   - No Parameter Store write errors
   - Memory cache hit logs
   - MongoDB TTL check logs
   - API call reduction over time

**Success Criteria:**
- ✅ All 46+ tests passing
- ✅ No Parameter Store errors in logs
- ✅ MongoDB contains safety data with lastChecked
- ✅ Memory cache working (logs show hits)
- ✅ API calls only on TTL expiration
- ✅ Lambda size ~5.2-5.3 MB (no increase)

---

## Rollback Plan

If migration causes issues:

1. **Code rollback:**
   ```bash
   git revert <migration-commit>
   npm run deploy
   ```

2. **Keep Parameter Store IAM:**
   - Don't remove Parameter Store permissions until verified working

3. **Gradual migration:**
   - Can migrate VIN decode first (Phase 2)
   - Then safety data (Phase 3-4)
   - Test each phase independently

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Memory Cache | 30 min | None |
| 2. VIN Decode | 1 hour | Phase 1 |
| 3. Safety APIs | 1.5 hours | Phase 1 |
| 4. Safety Endpoint | 1.5 hours | Phase 3 |
| 5. Remove DataCache | 30 min | Phase 2-4 |
| 6. Update Tests | 1 hour | Phase 5 |
| 7. Infrastructure | 30 min | Phase 6 |
| 8. Documentation | 30 min | Phase 7 |
| 9. Deploy & Verify | 30 min | Phase 8 |

**Total:** ~7 hours

**Recommended approach:** 2-3 sessions over 2 days

---

## Benefits After Migration

1. **Simpler Architecture**
   - One cache tier (memory) + one persistence tier (MongoDB)
   - No Parameter Store IAM complexity for cache
   - Fewer error cases to handle

2. **No Size Limits**
   - MongoDB handles large safety data easily
   - No 4KB/32KB constraints

3. **Better Testing**
   - No cache pollution between runs
   - Clear cache in beforeEach()
   - Predictable behavior

4. **Cost Savings**
   - $0 additional cost (using existing MongoDB)
   - Simpler IAM = less management overhead

5. **Single Source of Truth**
   - All vehicle data in MongoDB
   - Easier analytics and reporting
   - Consistent query patterns

---

## Status Tracking

- [ ] Phase 1: Memory Cache (NOT STARTED)
- [ ] Phase 2: VIN Decode (NOT STARTED)
- [ ] Phase 3: Safety APIs (NOT STARTED)
- [ ] Phase 4: Safety Endpoint (NOT STARTED)
- [ ] Phase 5: Remove DataCache (NOT STARTED)
- [ ] Phase 6: Update Tests (NOT STARTED)
- [ ] Phase 7: Infrastructure (NOT STARTED)
- [ ] Phase 8: Documentation (NOT STARTED)
- [ ] Phase 9: Deploy & Verify (NOT STARTED)

**Last Updated:** November 16, 2025
