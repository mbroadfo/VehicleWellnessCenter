# External API Caching Strategy

**Author:** Mike  
**Date:** November 16, 2025  
**Purpose:** Define caching approach for external vehicle data APIs based on data mutability and usage patterns

---

## Executive Summary

Our application integrates with multiple external APIs providing vehicle data. Each data source has different characteristics (mutability, size, cost, freshness requirements) that require tailored caching strategies. This document defines the optimal caching approach for each source.

**Key Principle:** Cache based on data lifecycle, not technology availability. Just because we CAN cache in Parameter Store doesn't mean we SHOULD.

---

## Current External APIs

### Implemented (Phase 1-2)

1. **NHTSA vPIC** - VIN decode (vehicle specifications)
2. **NHTSA Recalls** - Safety recall information
3. **NHTSA Complaints** - Consumer complaint database

### Planned (Phase 3-6)

1. **EPA FuelEconomy.gov** - Fuel economy ratings
2. **NHTSA Crash Ratings** - NCAP safety scores
3. **NHTSA Investigations** - Ongoing safety investigations

---

## Caching Strategy Matrix

| Data Source | Mutability | Size | Freshness Req | Cost | Current Cache | **Recommended Cache** | TTL | Rationale |
|-------------|-----------|------|---------------|------|---------------|---------------------|-----|-----------|
| **NHTSA vPIC** (VIN decode) | Immutable | Small (~2-3KB) | N/A (specs don't change) | Free | Memory + Parameter Store | **MongoDB only** | N/A | Decode once per vehicle, store in `vehicle.specs`. Never decode same VIN twice for same vehicle. Memory cache helps if same VIN decoded by different users (rare). Parameter Store adds complexity for minimal benefit. |
| **NHTSA Recalls** | Mutable (weekly) | Large (4KB+) | 7 days | Free | Memory + Parameter Store (FAILS) | **MongoDB + TTL** | 7 days | New recalls issued weekly. Store in `vehicle.safety.recalls` with `lastChecked` timestamp. Memory cache per Lambda container for hot paths. Avoid Parameter Store (exceeds 4KB limit). |
| **NHTSA Complaints** | Mutable (monthly) | Very Large (32KB+) | 30 days | Free | Memory + Parameter Store (FAILS) | **MongoDB + TTL** | 30 days | Complaints accumulate over time. Store in `vehicle.safety.complaints` with `lastChecked`. Parameter Store fails (exceeds 32KB limit). Memory cache for Lambda container reuse. |
| **EPA Fuel Economy** | Immutable | Small (~1KB) | N/A (EPA ratings stable) | Free | Not implemented | **MongoDB only** | N/A | EPA ratings don't change year-over-year. Store in `vehicle.fuelEconomy.epa` on first lookup. No expiration needed. Memory cache optional. |
| **EPA Real-World MPG** | Mutable (daily) | Small (~1KB) | 1-7 days | Free | Not implemented | **Memory only** | 1 day | User-reported data changes frequently. Memory cache per Lambda container sufficient. Not critical enough to store in MongoDB (would require update job). |
| **NHTSA Crash Ratings** | Immutable | Small (~2KB) | N/A (ratings final) | Free | Not implemented | **MongoDB only** | N/A | NCAP ratings published once per vehicle year. Store in `vehicle.safety.ncapRating` on first lookup. No expiration needed. |
| **NHTSA Investigations** | Mutable (weekly) | Medium (~5KB) | 7 days | Free | Not implemented | **MongoDB + TTL** | 7 days | Active investigations updated weekly. Store in `vehicle.safety.investigations` with `lastChecked`. Memory cache for hot paths. |

---

## Recommended Cache Tiers

### Tier 1: MongoDB Storage (Primary Persistence)

**Use for:**

- Data that enriches vehicle records (specs, safety scores, fuel economy)
- Data that users expect to persist (recalls, investigations)
- Data too large for Parameter Store (>4KB)
- Mutable data with reasonable TTL (7-30 days)

**Implementation:**

```typescript
// Vehicle document with cached external data
{
  _id: ObjectId,
  vin: "1C4PJMBS9HW664582",
  make: "Jeep",
  model: "Cherokee",
  year: 2017,
  
  specs: {                    // NHTSA vPIC (decode once, keep forever)
    engine: { ... },
    body: { ... },
    safety: { ... },
    decodedAt: Date
  },
  
  safety: {
    recalls: [ ... ],         // NHTSA Recalls (refresh every 7 days)
    complaints: [ ... ],      // NHTSA Complaints (refresh every 30 days)
    ncapRating: { ... },      // NHTSA Crash Ratings (immutable)
    investigations: [ ... ],  // NHTSA Investigations (refresh every 7 days)
    lastChecked: Date         // TTL tracking
  },
  
  fuelEconomy: {
    epa: { ... },             // EPA Fuel Economy (immutable)
    lastUpdated: Date
  }
}
```

**TTL Check Pattern:**
```typescript
async function getVehicleSafety(vehicleId: string) {
  const vehicle = await vehicles.findOne({ _id: vehicleId });
  
  // Check if safety data needs refresh
  const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
  const needsRefresh = !vehicle.safety?.lastChecked || 
                       (Date.now() - vehicle.safety.lastChecked.getTime()) > ttl;
  
  if (needsRefresh) {
    // Fetch fresh data from NHTSA
    const [recalls, complaints] = await Promise.all([
      vehicleDataClient.getRecalls(vehicle.make, vehicle.model, vehicle.year),
      vehicleDataClient.getComplaints(vehicle.make, vehicle.model, vehicle.year)
    ]);
    
    // Update MongoDB
    await vehicles.updateOne(
      { _id: vehicleId },
      { 
        $set: { 
          'safety.recalls': recalls,
          'safety.complaints': complaints,
          'safety.lastChecked': new Date()
        }
      }
    );
    
    return { recalls, complaints, lastChecked: new Date() };
  }
  
  // Return cached data
  return vehicle.safety;
}
```

**Benefits:**
- ✅ Single source of truth
- ✅ Data persists across Lambda restarts
- ✅ TTL checking is simple (compare timestamps)
- ✅ No Parameter Store IAM complexity
- ✅ No size limits (MongoDB handles MBs easily)
- ✅ Data available in MongoDB queries (analytics, reporting)

**Drawbacks:**
- ❌ Requires MongoDB query to check TTL
- ❌ Not shared across vehicles (each vehicle stores own data)

### Tier 2: Memory Cache (Lambda Container)

**Use for:**
- Hot path optimization (repeated calls within same request)
- Temporary data that doesn't need persistence
- Avoiding duplicate API calls during function execution
- Real-time data with short TTL (<1 hour)

**Implementation:**
```typescript
class MemoryCache {
  private cache = new Map<string, { data: any; expiresAt: number }>();
  
  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[Memory Cache HIT] ${key}`);
      return cached.data;
    }
    console.log(`[Memory Cache MISS] ${key}`);
    return null;
  }
  
  set(key: string, data: any, ttlSeconds: number) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }
  
  clear() {
    this.cache.clear();
  }
}

// Global instance (survives across invocations in same container)
const memoryCache = new MemoryCache();
```

**Benefits:**
- ✅ Sub-millisecond access time (0-1ms)
- ✅ Zero external dependencies
- ✅ Perfect for Lambda container reuse
- ✅ No size limits (within Lambda memory)

**Drawbacks:**
- ❌ Lost on Lambda cold start (every 15-45 min)
- ❌ Not shared across containers
- ❌ Not shared across vehicles

**Best Use Cases:**
- Same API called multiple times in one request
- Real-world MPG data (daily updates, not critical)
- Temporary computation results

### Tier 3: Parameter Store (NOT for External APIs)

**Use for:**
- Application secrets (MongoDB URI, API keys, etc.)
- Auth0 token caching (shared auth state)
- Infrastructure configuration
- Small (<4KB), frequently accessed values

**Do NOT use for:**
- External API response caching (too large, wrong use case)
- Vehicle-specific data (belongs in MongoDB)
- Mutable data with complex TTL logic

**Why NOT External APIs:**
- ❌ Size limits (4KB Standard, 32KB Advanced)
- ❌ No query capabilities (key-value only)
- ❌ Not vehicle-scoped (keys would need vehicle ID)
- ❌ IAM complexity for minimal benefit
- ❌ Test pollution (cache persists between runs)
- ❌ Cost for Advanced tier ($0.05/10K requests)

---

## Migration Plan: Remove Parameter Store from External APIs

### Current State (Problematic)

**VIN Decode:**
```typescript
// ❌ Current: Two-tier cache (Memory + Parameter Store)
async decodeVIN(vin: string): Promise<VehicleSpecs> {
  return this.cache.get(
    `vin/${vin}`,
    () => this.fetchVPICData(vin),
    30 * 24 * 60 * 60  // 30 days
  );
}
```

**Safety Data:**
```typescript
// ❌ Current: Two-tier cache (FAILS - data too large)
async getRecalls(make: string, model: string, year: number): Promise<RecallData[]> {
  return this.cache.get(
    `recalls/${make}/${model}/${year}`,
    () => this.fetchRecallsData(make, model, year),
    7 * 24 * 60 * 60  // 7 days
  );
}
```

### Target State (Simplified)

**VIN Decode:**
```typescript
// ✅ Target: Memory-only cache + store in MongoDB
async decodeVIN(vin: string): Promise<VehicleSpecs> {
  // Check memory cache
  const cached = memoryCache.get<VehicleSpecs>(`vin/${vin}`);
  if (cached) return cached;
  
  // Fetch from API
  const specs = await this.fetchVPICData(vin);
  
  // Cache in memory for Lambda container reuse
  memoryCache.set(`vin/${vin}`, specs, 24 * 60 * 60); // 24 hours
  
  return specs;
  // Caller stores in MongoDB: vehicle.specs = specs
}
```

**Safety Data:**
```typescript
// ✅ Target: Check MongoDB TTL, memory cache during request
async getVehicleSafety(vehicleId: string): Promise<SafetyData> {
  // Check memory cache first (hot path)
  const cacheKey = `safety/${vehicleId}`;
  const cached = memoryCache.get<SafetyData>(cacheKey);
  if (cached) return cached;
  
  // Check MongoDB
  const vehicle = await vehicles.findOne({ _id: vehicleId });
  
  // Check TTL
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const needsRefresh = !vehicle.safety?.lastChecked ||
                       (Date.now() - vehicle.safety.lastChecked.getTime()) > ttl;
  
  if (!needsRefresh) {
    // Use cached MongoDB data
    const safetyData = {
      recalls: vehicle.safety.recalls,
      complaints: vehicle.safety.complaints,
      lastChecked: vehicle.safety.lastChecked
    };
    
    // Cache in memory for this Lambda container
    memoryCache.set(cacheKey, safetyData, 60 * 60); // 1 hour
    
    return safetyData;
  }
  
  // Fetch fresh data
  const [recalls, complaints] = await Promise.all([
    vehicleDataClient.getRecalls(vehicle.make, vehicle.model, vehicle.year),
    vehicleDataClient.getComplaints(vehicle.make, vehicle.model, vehicle.year)
  ]);
  
  const safetyData = {
    recalls,
    complaints,
    lastChecked: new Date()
  };
  
  // Update MongoDB
  await vehicles.updateOne(
    { _id: vehicleId },
    { $set: { safety: safetyData } }
  );
  
  // Cache in memory
  memoryCache.set(cacheKey, safetyData, 60 * 60);
  
  return safetyData;
}
```

### Implementation Steps

1. **Create MemoryCache class** in `backend/src/lib/cache.ts`
2. **Update VehicleDataClient** to use memory-only cache
3. **Update route handlers** to check MongoDB TTL and refresh when needed
4. **Remove Parameter Store imports** from `externalApis.ts`
5. **Update tests** to not expect Parameter Store writes
6. **Update IAM policy** to remove Parameter Store permissions for cache paths (keep for secrets)
7. **Document** new caching strategy in README

### Migration Testing

**Before migration:**
```bash

# Run tests - see Parameter Store failures
npm test -- vehicleSafety.test.ts
# Expected: 9 pass, but stderr shows Parameter Store write failures
```

**After migration:**
```bash

# Run tests - no Parameter Store calls
npm test -- vehicleSafety.test.ts
# Expected: 9 pass, clean output, no cache warnings
```

---

## Performance Comparison

### Current Implementation (Two-Tier Cache)

**First call (cold Lambda):**
```
Memory miss → Parameter Store miss → API call (500ms) → Store both caches
Total: ~500ms
```

**Second call (same vehicle, same container):**
```
Memory hit → Return (0-1ms)
Total: ~1ms ✅
```

**Third call (same vehicle, different container):**
```
Memory miss → Parameter Store hit (50-100ms) → Return
Total: ~75ms
```

**Problem:** Parameter Store tier fails for safety data (too large), adds complexity for VIN decode (minimal benefit)

### Proposed Implementation (MongoDB + Memory)

**First call (cold Lambda):**
```
Memory miss → MongoDB query (10-20ms) → TTL expired → API call (500ms) → Update MongoDB
Total: ~530ms
```

**Second call (same vehicle, same container):**
```
Memory hit → Return (0-1ms)
Total: ~1ms ✅
```

**Third call (same vehicle, different container):**
```
Memory miss → MongoDB query (10-20ms) → TTL valid → Return + cache in memory
Total: ~20ms ✅
```

**Benefits:** Simpler, works for large data, persistent across containers, no IAM complexity

---

## Cost Analysis

### Current Approach (Parameter Store)

**Parameter Store Standard (Free):**
- API calls: Free for standard throughput
- Storage: Free up to 10,000 parameters
- **Problem:** 4KB size limit (safety data fails)

**Parameter Store Advanced ($0.05/10K requests):**
- API calls: $0.05 per 10,000 requests
- Storage: $0.05 per parameter per month
- Size limit: 32KB (still too small for complaints data)
- **Problem:** Adds cost for data that should be in MongoDB

**Current Monthly Cost:**
- If using Advanced: ~$2-5/month for cache operations
- IAM policy management overhead

### Proposed Approach (MongoDB + Memory)

**MongoDB Atlas M0 (Free tier):**
- Already in use
- 512 MB storage (plenty for vehicle data)
- No additional cost for caching
- Safety data is ~50-100KB per vehicle (500 vehicles = 50 MB)

**Memory Cache:**
- Included in Lambda memory allocation
- No additional cost
- 512 MB Lambda has ~100 MB available for cache

**Proposed Monthly Cost:**
- $0 additional (using existing MongoDB)
- Simpler IAM (fewer Parameter Store permissions)

**Savings:** ~$2-5/month + reduced complexity

---

## Monitoring Strategy

### Key Metrics

**Cache Performance:**
- Memory cache hit rate (target: >80% for hot vehicles)
- MongoDB cache hit rate (TTL valid) (target: >90% for 7-day recalls)
- API call rate (should decrease over time as vehicles accumulate)

**Data Freshness:**
- Vehicles with stale safety data (lastChecked > 7 days)
- Average time since last safety check
- Background job: nightly scan for vehicles needing refresh

**MongoDB Performance:**
- Query latency for vehicle lookups (target: <20ms)
- Index usage on vehicle collection
- Storage growth over time

### CloudWatch Logs

```typescript
// Log cache operations
console.log(JSON.stringify({
  event: 'cache_operation',
  operation: 'memory_hit',
  key: 'safety/6916159d6abd942ccd1ef492',
  latency: 1,
  timestamp: new Date().toISOString()
}));

console.log(JSON.stringify({
  event: 'cache_operation',
  operation: 'mongodb_ttl_valid',
  key: 'safety/6916159d6abd942ccd1ef492',
  ttl_remaining: 345600000,  // 4 days in ms
  latency: 15,
  timestamp: new Date().toISOString()
}));

console.log(JSON.stringify({
  event: 'api_call',
  source: 'NHTSA Recalls',
  vehicle: 'Jeep Cherokee 2017',
  latency: 523,
  cached: false,
  timestamp: new Date().toISOString()
}));
```

### Dashboard Queries

```sql
-- Memory cache hit rate (last 24 hours)
fields @timestamp, operation
| filter event = "cache_operation"
| stats count(operation = "memory_hit") / count(*) * 100 as hit_rate

-- Average API call latency by source
fields @timestamp, source, latency
| filter event = "api_call"
| stats avg(latency) by source

-- Vehicles needing safety data refresh
-- (Run as scheduled MongoDB query, not CloudWatch)
db.vehicles.countDocuments({
  $or: [
    { 'safety.lastChecked': { $exists: false } },
    { 'safety.lastChecked': { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
  ]
})
```

---

## Implementation Checklist

### Phase 1: Create Memory Cache Utility (30 min)

- [ ] Create `backend/src/lib/cache.ts` with `MemoryCache` class
- [ ] Add unit tests for cache operations
- [ ] Export singleton instance

### Phase 2: Refactor VehicleDataClient (1 hour)

- [ ] Replace `DataCache` (Parameter Store) with `MemoryCache`
- [ ] Update `decodeVIN()` method
- [ ] Update `getRecalls()` method
- [ ] Update `getComplaints()` method
- [ ] Remove Parameter Store imports
- [ ] Update tests

### Phase 3: Update Route Handlers (1 hour)

- [ ] Update `enrichVehicle.ts` to store specs in MongoDB
- [ ] Update `getVehicleSafety.ts` to check MongoDB TTL
- [ ] Add MongoDB update operations for safety data
- [ ] Update response formats (include `lastChecked` timestamps)

### Phase 4: Update Data Model (30 min)

- [ ] Document updated vehicle schema in `docs/data-model.md`
- [ ] Add MongoDB indexes if needed (`safety.lastChecked`)
- [ ] Test MongoDB queries for performance

### Phase 5: Update Tests (1 hour)

- [ ] Remove expectations of Parameter Store writes
- [ ] Add MongoDB assertions for cached data
- [ ] Test TTL expiration logic
- [ ] Test memory cache hit/miss patterns

### Phase 6: Infrastructure Cleanup (30 min)

- [ ] Update IAM policy (remove Parameter Store cache permissions)
- [ ] Remove Parameter Store terraform resources for cache (keep secrets)
- [ ] Update documentation (README, CHANGELOG)

### Phase 7: Deploy and Monitor (Ongoing)

- [ ] Deploy to production
- [ ] Monitor CloudWatch for cache metrics
- [ ] Verify MongoDB storage growth
- [ ] Collect user feedback on performance

**Total Estimated Time:** 4-5 hours

---

## Conclusion

**Key Decisions:**

1. **VIN Decode:** Memory-only cache → Store in MongoDB (`vehicle.specs`)
2. **Safety Data:** MongoDB with TTL + memory cache for hot paths
3. **Fuel Economy:** Store in MongoDB on first lookup (immutable)
4. **Real-World MPG:** Memory-only cache (not critical, changes daily)
5. **Parameter Store:** Reserved for secrets and Auth0 tokens ONLY

**Benefits:**
- ✅ Simpler architecture (fewer moving parts)
- ✅ Works for large data (no size limits)
- ✅ Persistent across Lambda restarts
- ✅ Single source of truth (MongoDB)
- ✅ No IAM complexity for cache operations
- ✅ No test pollution from persistent cache
- ✅ Cost savings (~$2-5/month)

**Trade-offs:**
- ⚠️ MongoDB query overhead (~10-20ms vs ~50ms Parameter Store vs ~0ms memory)
- ⚠️ Must implement TTL checking logic
- ⚠️ Cache not shared across vehicles (each vehicle stores own data)

**Net Result:** Better architecture that aligns with actual usage patterns and data characteristics.
