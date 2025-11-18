# Data Storage Strategy - Vehicle Wellness Center

## Overview

This document defines storage strategies for different data types in the Vehicle Wellness Center application. The goal is to maximize functionality while staying within MongoDB Atlas M0 free tier limits (512 MB).

**Design Principles:**
1. **User data is sacred** - Store all user-provided and user-modified data permanently in MongoDB
2. **External API data is cached** - Use appropriate caching tier based on mutability, size, and freshness requirements
3. **Large datasets use ephemeral storage** - Re-fetch or use AWS services for data that would consume significant MongoDB space
4. **AI conversations are time-boxed** - Store recent history with TTL for smart context without permanent storage burden

---

## Data Storage Strategy Matrix

| Data Type | Size per Vehicle | Mutability | Storage Strategy | Retention | Rationale |
|-----------|------------------|------------|------------------|-----------|-----------|
| **USER DATA (Core - Always MongoDB)** |
| Fleet | 1 KB | User-managed | MongoDB permanent | Forever | Core user data - small, critical |
| Vehicle | 2 KB | User-managed | MongoDB permanent | Forever | Core user data - small, critical |
| Vehicle Events | 500 bytes/event | User-managed | MongoDB permanent | Forever | Core user data - even 1000 events = 500 KB |
| **EXTERNAL API DATA (Cached)** |
| VIN Decode (specs) | 3 KB | Immutable | MongoDB permanent | Forever | One-time lookup, never changes, small |
| Safety Recalls | 10 KB (6 recalls) | Changes occasionally | MongoDB + TTL check | 7 days refresh | Critical safety data - keep all, check freshness |
| Safety Complaints | 200 KB (1249 items) | Mostly static | **DynamoDB** or re-fetch | On-demand | Large dataset - use AWS service or ephemeral |
| Fuel Economy (EPA) | 1 KB | Immutable | MongoDB permanent | Forever | One-time lookup, never changes, tiny |
| NCAP Ratings | 2 KB | Immutable | MongoDB permanent | Forever | One-time lookup, never changes, small |
| Market Value | 500 bytes | Changes monthly | MongoDB + TTL check | 30 days refresh | Small, infrequent - worth caching |
| **AI & CONVERSATION DATA** |
| Conversation Messages | 300 bytes/msg | Historical | MongoDB + 30-day TTL | 30 days | Auto-cleanup, smart context window |
| Conversation Sessions | 500 bytes + messages | Active until idle | MongoDB + 90-day idle TTL | 90 days inactive | Session metadata preserved longer |
| **ANALYTICS & AUDIT (Optional)** |
| API Call Logs | 200 bytes/call | Historical | **CloudWatch Logs** | 3 days | AWS native, automatic retention |
| Error Logs | 500 bytes/error | Historical | **CloudWatch Logs** | 7 days | AWS native, debugging |
| Usage Metrics | varies | Aggregated | **CloudWatch Metrics** | 15 days | AWS native, free dashboards |

---

## Detailed Strategy by Data Category

### 1. User Core Data (MongoDB Permanent)

**Collections:** `fleets`, `vehicles`, `vehicleEvents`

**Strategy:** Store everything the user provides, no limits, no TTL.

**Event optimization:**
```typescript
// Compact event schema
{
  _id: ObjectId,          // 12 bytes
  vehicleId: ObjectId,    // 12 bytes
  type: string,           // 15 bytes ("oil_change")
  occurredAt: Date,       // 8 bytes
  mileage: number,        // 8 bytes
  summary: string,        // 50 bytes avg
  cost: number,           // 8 bytes
  details: {              // 100 bytes avg (optional)
    oilType: "5W-30",
    filter: "Fram PH8A",
    vendor: "Jiffy Lube"
  },
  createdAt: Date         // 8 bytes
}
// Total: ~220 bytes per event
```

**Storage projection:**
- 100 events/vehicle = 22 KB
- 500 events/vehicle = 110 KB
- 1000 events/vehicle = 220 KB
- **10 vehicles with heavy use = 2.2 MB** (0.4% of free tier)

**Verdict:** ✅ No concerns. User data stays in MongoDB forever.

---

### 2. Small Immutable External Data (MongoDB Permanent)

**Data types:** VIN decode, fuel economy, NCAP ratings

**Strategy:** Fetch once, store permanently in vehicle document.

```typescript
// In vehicles collection
{
  _id: ObjectId,
  vin: "1C4PJMBS9HW664582",
  
  // Enrichment data (stored permanently)
  specs: {
    engine: { cylinders: 6, displacement: 3.2, fuelType: "Gasoline" },
    body: { type: "SUV", doors: 4 },
    transmission: { type: "Automatic", speeds: 9 },
    decodedAt: Date,
    source: "NHTSA_vPIC"
  },
  
  fuelEconomy: {
    epa: { city: 21, highway: 29, combined: 24 },
    lastUpdated: Date,
    source: "EPA_API"
  },
  
  safety: {
    ncapRating: { overall: 4, frontal: 4, side: 5 },
    lastUpdated: Date,
    source: "NHTSA_NCAP"
  }
}
```

**Storage:** 3 KB + 1 KB + 2 KB = 6 KB per vehicle

**Verdict:** ✅ Negligible. 100 vehicles = 600 KB (0.1% of free tier)

---

### 3. Small Mutable External Data (MongoDB + TTL Refresh)

**Data types:** Safety recalls, market value estimates

**Strategy:** Store in MongoDB, check `lastChecked` timestamp, refresh if stale.

```typescript
// In vehicles collection
{
  _id: ObjectId,
  
  safety: {
    recalls: [
      {
        campaignNumber: "24V123000",
        component: "Fuel Pump",
        summary: "...",
        consequence: "...",
        remedy: "...",
        announcedDate: Date
      }
      // ... more recalls
    ],
    lastChecked: Date,  // Re-fetch if > 7 days old
    source: "NHTSA_Recalls"
  },
  
  marketValue: {
    trade: 18500,
    private: 21000,
    dealer: 24500,
    lastUpdated: Date,  // Re-fetch if > 30 days old
    source: "KBB_API"
  }
}
```

**Storage:** 10 KB (recalls) + 500 bytes (value) = 10.5 KB per vehicle

**TTL check pattern:**
```typescript
// In route handler
const vehicle = await db.collection('vehicles').findOne({ _id });
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

if (!vehicle.safety.lastChecked || vehicle.safety.lastChecked < sevenDaysAgo) {
  // Re-fetch recalls from NHTSA
  const freshRecalls = await vehicleDataClient.getRecalls(...);
  
  // Update MongoDB
  await db.collection('vehicles').updateOne(
    { _id },
    { $set: { 'safety.recalls': freshRecalls, 'safety.lastChecked': new Date() } }
  );
}

// Return (possibly refreshed) data
return vehicle.safety.recalls;
```

**Verdict:** ✅ Small datasets that change occasionally. Worth storing.

---

### 4. Large External Datasets (Alternative Strategies)

**Data type:** Safety complaints (200 KB per popular vehicle model)

#### Option A: DynamoDB (Recommended for Scale)

**Why DynamoDB:**
- AWS Free Tier: 25 GB storage forever
- 25 read/write units per second
- No database size anxiety
- Pay-as-you-go beyond free tier ($0.25/GB/month)

**Schema:**
```typescript
// DynamoDB table: vwc-safety-complaints
{
  pk: "COMPLAINTS#Jeep#Cherokee#2017",  // Partition key
  sk: "ODI#12345678",                    // Sort key (complaint ID)
  manufacturer: "FCA US LLC",
  crash: true,
  fire: false,
  injuries: 2,
  deaths: 0,
  dateOfIncident: "2024-03-15",
  components: "Steering",
  summary: "Steering wheel locked while driving...",
  dateComplaintFiled: "2024-03-20",
  vin: "...",
  ttl: 1735689600  // Auto-delete after 30 days (optional)
}
```

**Access pattern:**
```typescript
// Store after first fetch
await dynamoDB.batchWriteItem({
  RequestItems: {
    'vwc-safety-complaints': complaints.map(c => ({
      PutRequest: { Item: { ... } }
    }))
  }
});

// Query for vehicle
const result = await dynamoDB.query({
  TableName: 'vwc-safety-complaints',
  KeyConditionExpression: 'pk = :pk',
  ExpressionAttributeValues: {
    ':pk': `COMPLAINTS#${make}#${model}#${year}`
  }
});
```

**Cost:** Free for personal use, $0.25/GB beyond 25 GB

**Effort:** 4-6 hours (Terraform + SDK integration)

**Verdict:** ✅ Best option if you want full complaint dataset

---

#### Option B: S3 + CloudFront (Good for Read-Heavy)

**Why S3:**
- AWS Free Tier: 5 GB storage, 20k GET requests/month
- Store JSON files per vehicle model
- CloudFront CDN for global fast access
- Extremely cheap: $0.023/GB/month

**Schema:**
```
s3://vwc-vehicle-data/
  complaints/
    Jeep/Cherokee/2017.json  (200 KB)
    Ford/F-150/2020.json      (350 KB)
    ...
```

**Access pattern:**
```typescript
// Fetch from S3
const s3Url = `https://vwc-vehicle-data.s3.amazonaws.com/complaints/${make}/${model}/${year}.json`;
const response = await fetch(s3Url);
const complaints = await response.json();

// Cache in Lambda memory for 15 minutes
memoryCache.set(`complaints:${make}:${model}:${year}`, complaints, 900);
```

**Cost:** Free for personal use, pennies beyond

**Effort:** 3-4 hours (S3 bucket + CloudFront + upload script)

**Verdict:** ✅ Good option if complaints are mostly read-only

---

#### Option C: Re-fetch Every Time (Simplest)

**Why re-fetch:**
- NHTSA API is free and fast (500-1000ms)
- No storage cost
- Always fresh data
- Simple implementation

**Implementation:**
```typescript
// In getVehicleSafety handler
async handler(event) {
  const vehicle = await getVehicle(vehicleId);
  
  // Always fresh from NHTSA (cached in Lambda memory for 15 min)
  const complaints = await vehicleDataClient.getComplaints(
    vehicle.specs.make,
    vehicle.specs.model,
    vehicle.specs.year
  );
  
  return {
    recalls: vehicle.safety.recalls,  // From MongoDB
    complaints: complaints             // From API/memory cache
  };
}
```

**Memory cache in Lambda:**
```typescript
// In externalApis.ts - already implemented!
async getComplaints(make, model, year) {
  const cacheKey = `complaints:${make}:${model}:${year}`;
  
  // Check Lambda memory cache (0-1ms)
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  
  // Fetch from NHTSA (500ms)
  const complaints = await fetchComplaintsFromNHTSA(...);
  
  // Cache in Lambda memory for 30 days
  memoryCache.set(cacheKey, complaints, 30 * 24 * 60 * 60);
  
  return complaints;
}
```

**Lambda memory cache benefits:**
- Lasts 15-45 minutes (typical container lifetime)
- Multiple requests within that window hit memory (1ms)
- After container expires, new container fetches fresh data
- Zero storage cost

**Verdict:** ✅ **Current implementation - works great!** Only upgrade to DynamoDB/S3 if you need longer cache or offline access

---

### 5. AI Conversation Data (MongoDB + TTL)

**Collections:** `conversation_messages`, `conversation_sessions`

**Strategy:** Store recent conversations with automatic cleanup.

```typescript
// conversation_messages collection
{
  _id: ObjectId,
  sessionId: ObjectId,
  vehicleId: ObjectId,  // optional
  userId: string,
  role: "user" | "assistant",
  content: string,
  toolsUsed: [string],  // optional
  timestamp: Date
}

// TTL index (auto-delete after 30 days)
db.conversation_messages.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 2592000 }
);

// conversation_sessions collection (metadata)
{
  _id: ObjectId,  // sessionId
  vehicleId: ObjectId,  // optional
  userId: string,
  createdAt: Date,
  lastActiveAt: Date,
  messageCount: number,
  title: string  // Generated from first message
}

// TTL index (delete inactive sessions after 90 days)
db.conversation_sessions.createIndex(
  { lastActiveAt: 1 },
  { expireAfterSeconds: 7776000 }
);
```

**Storage projection:**
- Active user: 20 conversations/month × 30 messages = 600 messages = 180 KB
- With TTL: Never exceeds 180 KB per user
- 10 active users = 1.8 MB (0.35% of free tier)

**Verdict:** ✅ TTL keeps storage bounded, provides smart context window

---

### 6. Observability Data (AWS CloudWatch)

**Why CloudWatch instead of MongoDB:**
- Free tier: 5 GB logs, 10 custom metrics, 3 dashboards
- Automatic retention management
- Native Lambda integration
- Query with CloudWatch Insights
- Alarms and notifications

**What to log:**
```typescript
// API Gateway access logs (automatic)
// Lambda execution logs (automatic)
console.log('VIN decode', { vin, duration: 234, cached: false });
console.error('External API failed', { service: 'NHTSA', error });

// Custom metrics (optional)
await cloudwatch.putMetricData({
  Namespace: 'VWC/Application',
  MetricData: [{
    MetricName: 'ExternalAPILatency',
    Value: 234,
    Unit: 'Milliseconds',
    Dimensions: [{ Name: 'Service', Value: 'NHTSA' }]
  }]
});
```

**Verdict:** ✅ Use AWS native services for ephemeral operational data

---

## Storage Budget Summary (512 MB Free Tier)

| Category | Storage Estimate | Budget % | Notes |
|----------|------------------|----------|-------|
| **MongoDB Core** |
| Vehicles (10) | 20 KB | <1% | Metadata only |
| Vehicle Events (500 each) | 1.1 MB | 22% | 5,000 total events |
| VIN Specs (10) | 30 KB | <1% | One-time enrichment |
| Recalls (10) | 100 KB | 2% | Stored, 7-day refresh |
| Fuel Economy (10) | 10 KB | <1% | One-time enrichment |
| **MongoDB Conversations** |
| Messages (30-day TTL) | 1.8 MB | 36% | 10 users, auto-cleanup |
| Sessions (90-day TTL) | 50 KB | <1% | Metadata only |
| **MongoDB Overhead** |
| Indexes | ~1 MB | 20% | Estimated |
| WiredTiger compression | -60% | savings | Automatic |
| **External Storage** |
| Complaints (DynamoDB) | 0 MB | 0% | DynamoDB free tier: 25 GB |
| Logs (CloudWatch) | 0 MB | 0% | CloudWatch free tier: 5 GB |
| **Total Used** | ~4.1 MB × 0.4 (compression) | **~33%** | **337 MB free** |

**Verdict:** Comfortable headroom for 10-20 vehicles with full features for years.

---

## Recommendations by Phase

### Phase 1 (Current - MVP)
✅ **Already implemented:**
- User data in MongoDB (permanent)
- VIN specs in MongoDB (permanent)
- Recalls in MongoDB (7-day refresh)
- Complaints via memory cache + API re-fetch (ephemeral)

✅ **Add now (3-5 hours):**
- Conversation history with 30-day TTL
- Session metadata with 90-day idle TTL

**Result:** Full AI context, zero storage concerns

---

### Phase 2 (Scale to 10+ Vehicles)
If you add more vehicles and want to optimize:

✅ **Consider:**
- DynamoDB for complaints (if offline access needed)
- S3 for static datasets (if API calls become frequent)
- Reduce conversation TTL to 14 days (if approaching limits)

**Trigger:** MongoDB usage > 400 MB (75%)

---

### Phase 3 (Production/Multi-User)
If you launch publicly:

✅ **Upgrade options:**
- MongoDB Atlas M2 ($9/month, 2 GB) - easiest
- DynamoDB for all large datasets - most scalable
- S3 + CloudFront for static content - most cost-effective

**Trigger:** Need to support 50+ active users or 100+ vehicles

---

## Decision Tree

```
Is this user-provided data?
├─ YES → MongoDB permanent, no TTL
└─ NO → Is it small (<10 KB) and immutable?
    ├─ YES → MongoDB permanent (specs, fuel economy)
    └─ NO → Does it change frequently?
        ├─ YES (weekly) → MongoDB + TTL refresh check (recalls)
        ├─ SOMETIMES (monthly) → MongoDB + TTL refresh check (market value)
        └─ NO → Is it large (>50 KB)?
            ├─ YES → DynamoDB, S3, or ephemeral re-fetch (complaints)
            └─ NO → MongoDB with TTL cleanup (conversations)
```

---

## Next Steps

1. **Implement conversation history** with TTL (3-5 hours)
2. **Monitor MongoDB usage** with `db.stats()` monthly
3. **Upgrade storage strategy** only if usage exceeds 400 MB
4. **Keep complaints ephemeral** (current implementation works great)

**Want to proceed with conversation history implementation?**
