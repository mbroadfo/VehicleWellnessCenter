# Implementation Plan - Data Storage Strategy

## Executive Summary

**Goal:** Implement the data storage strategy defined in `data-storage-strategy.md` systematically across all external data sources.

**Current Status:** ✅ 5 of 5 external sources implemented (VIN decode, Safety data, EPA Fuel Economy, NCAP Safety Ratings, Dealer Portal Import)

**Remaining Work:**

- AI conversation persistence = 4-6 hours (in progress)

---

## Current Implementation Status

### ✅ Already Implemented (Phase 12 Complete)

| Data Source | API | Storage | TTL/Refresh | Status |
|-------------|-----|---------|-------------|--------|
| **VIN Decode** | NHTSA vPIC | MongoDB `vehicle.specs` | Permanent (immutable) | ✅ Complete |
| **Safety Recalls** | NHTSA Recalls | MongoDB `vehicle.safety.recalls` | 7-day check | ✅ Complete |
| **Safety Complaints** | NHTSA Complaints | Memory cache only | 30 days (ephemeral) | ✅ Complete |
| **Fuel Economy** | EPA Fuel Economy | MongoDB `vehicle.fuelEconomy.epa` | Permanent (immutable) | ✅ Complete |
| **NCAP Safety Ratings** | NHTSA NCAP | MongoDB `vehicle.safety.ncapRating` | Permanent (immutable) | ✅ Complete |
| **Dealer Portal Data** | Gemini AI parsing | MongoDB `vehicle.dealerPortal` + `events` | On-demand (user trigger) | ✅ Complete |

**Implementation details:**

- ✅ `externalApis.ts`: `decodeVIN()`, `getRecalls()`, `getComplaints()`, `getFuelEconomy()`, `getSafetyRatings()`
- ✅ `enrichVehicle.ts`: Stores specs + EPA fuel economy in MongoDB permanently
- ✅ `getVehicleSafety.ts`: Stores recalls + NCAP ratings in MongoDB, complaints ephemeral
- ✅ `importDealerData.ts`: Parses Mopar dashboard/service history via Gemini, stores in MongoDB
- ✅ Memory cache: Lambda container reuse (15-45 min lifetime)
- ✅ Tests: 100 passing (92 existing + 8 dealer import tests)

**What works perfectly:**

```typescript
// Pattern 1: Immutable data → MongoDB permanent
// Example: VIN decode
const specs = await vehicleDataClient.decodeVIN(vin);
await vehiclesCollection.updateOne({ _id }, { $set: { specs, updatedAt: Date.now() } });

// Pattern 2: Mutable data → MongoDB + TTL check
// Example: Recalls (7-day freshness)
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
if (!vehicle.safety?.lastChecked || vehicle.safety.lastChecked < sevenDaysAgo) {
  const freshRecalls = await vehicleDataClient.getRecalls(make, model, year);
  await vehiclesCollection.updateOne({ _id }, { $set: { 'safety.recalls': freshRecalls, 'safety.lastChecked': new Date() } });
}

// Pattern 3: Large dataset → Ephemeral (memory cache + re-fetch)
// Example: Complaints (200 KB, free API)
const complaints = await vehicleDataClient.getComplaints(make, model, year);
// Cached in Lambda memory for 30 days, no MongoDB storage
```

---

## Remaining External Data Sources

### ✅ Phase 10: Fuel Economy (EPA) - COMPLETE (2025-11-18)

**API:** EPA Fuel Economy API (free, public, XML-only)

- Endpoint: `https://www.fueleconomy.gov/ws/rest/vehicle/{id}`
- Response: City/Highway/Combined MPG, annual fuel cost, CO2 emissions
- Size: ~1 KB per vehicle
- Mutability: Immutable (EPA ratings don't change)

**Storage Strategy:** MongoDB permanent (Pattern 1)

**Implementation checklist:**

- [x] Add EPA API client to `externalApis.ts`
  - `searchEPAVehicle()`: Hierarchical search via /menu/model + /menu/options
  - `getFuelEconomy(epaId)`: Fetch fuel economy by EPA vehicle ID
  - `matchVehicleToEPA()`: Smart matching with engine spec filtering
  - XML parsing via fast-xml-parser library
- [x] Integrate with enrichVehicle route (Option A: auto-enrich)
  - Non-blocking EPA fetch after VIN decode
  - Stores in MongoDB `vehicle.fuelEconomy.epa` (permanent)
- [x] Add memory cache (24-hour TTL search, permanent TTL fuel data)
- [x] Write tests (12 EPA tests, all passing)
  - Vehicle search, fuel economy fetch, smart matching, caching, error handling
  - Full test suite: 86 tests passing
- [x] Update TypeScript types (VehicleSpecs now includes year/make/model)
- [x] Deploy Lambda (5.35 MB with fast-xml-parser)

**Implementation Notes:**

- EPA API is XML-only despite documentation claiming JSON support
- Hierarchical search pattern: year/make → model list → options (engine/trans) → vehicle ID
- Multiple variants exist for same model (e.g., 14 variants for 2017 Jeep Cherokee)
- Smart matching filters by cylinders and displacement to find best match
- Added VehicleSpecs.year/make/model fields from vPIC response for EPA lookup

**Actual effort:** ~6 hours (API exploration, XML parsing, testing, deployment)

---

### ✅ Phase 11: NCAP Safety Ratings - COMPLETE (2025-11-18)

**API:** NHTSA NCAP API (free, public)

- Endpoint: `https://api.nhtsa.gov/SafetyRatings/modelyear/{year}/make/{make}/model/{model}` (search)
- Endpoint: `https://api.nhtsa.gov/SafetyRatings/VehicleId/{id}` (ratings)
- Response: Overall/Frontal/Side/Rollover ratings (1-5 stars), rollover risk %, safety features
- Size: ~2 KB per vehicle
- Mutability: Immutable (ratings finalized once published)

**Storage Strategy:** MongoDB permanent (Pattern 1)

**Implementation checklist:**

- [x] Add NCAP API client to `externalApis.ts`
  - Two-step process: search by year/make/model → fetch ratings by vehicle ID
  - Returns NCAPRatings with star ratings, rollover risk, safety features (ESC/FCW/LDW)
  - Memory cache with 24-hour TTL
  - Non-blocking error handling (returns null)
- [x] Extend `GET /vehicles/:id/safety` to include NCAP ratings
  - Parallel fetch with recalls + complaints
  - Response summary includes `hasNCAPRatings` and `overallRating` fields
- [x] Store in MongoDB `vehicle.safety.ncapRating` (permanent)
- [x] Add memory cache (24-hour TTL, Lambda container reuse)
- [x] Write tests (6 NCAP unit tests + integration tests)
  - Test vehicle: 2017 Jeep Cherokee 4WD (NCAP ID 11348)
  - Expected ratings: 4/4/5/4 stars, 16.9% rollover risk
  - Full test suite: 92 tests passing
- [x] Add to TypeScript types (NCAPRatings interface)
- [x] Deploy Lambda (5.36 MB)
- [x] Production verification (API Gateway tests passing)

**Implementation Notes:**

- NCAP API uses two-step process: search returns vehicle IDs, then fetch ratings by ID
- Typically returns first variant (most common, usually 4WD for SUVs)
- Star ratings range 1-5, rollover risk is percentage (0-100%)
- Safety features: ESC (Electronic Stability Control), FCW (Forward Collision Warning), LDW (Lane Departure Warning)
- Older vehicles (pre-2011) may not have NCAP ratings
- Non-blocking implementation: returns null if ratings unavailable, doesn't fail safety endpoint

**Actual effort:** ~4 hours (API exploration, two-step implementation, testing, deployment)

- API client: 1.5 hours (two-step process discovery)
- Route update: 30 min
- Tests: 1.5 hours (6 unit tests + integration)
- Deployment + verification: 30 min

---

### ✅ Phase 12: Dealer Portal Data Import - COMPLETE (2025-11-18)

**Approach:** AI-powered HTML parsing via Gemini for user copy/paste workflow (pivoted from KBB browser automation)

**Why we pivoted from KBB:**

- ❌ **Bot detection:** "Access Denied" from KBB, even with headless browser masking
- ❌ **Multi-step wizard:** Required mileage, color, features, condition, EMAIL
- ❌ **Legal concerns:** Violates ToS, no commercial use allowed
- ❌ **Lower accuracy:** Public estimates less accurate than actual dealer data
- ✅ **Dealer portal superiority:** Real mileage (3,560 vs 96k estimate), warranty, service history, recalls

**New Strategy:** User-controlled data import from dealer portals (Mopar, GM, Ford, Toyota)

- User logs into dealer portal (e.g., <https://www.mopar.com/my-vehicle/dashboard>)
- User copies HTML of dashboard page or service history
- AI parses HTML with Gemini text model (not Vision)
- System imports: mileage, warranty, coverage plans, service records, recalls

**Architecture:**

```typescript
// routes/importDealerData.ts
async function importDealerDataHandler(event: APIGatewayProxyEventV2) {
  const { vehicleId } = event.pathParameters;
  const { source, dataType, content } = JSON.parse(event.body);
  
  // source: 'mopar' | 'gm' | 'ford' | 'toyota'
  // dataType: 'dashboard' | 'service_history' | 'recalls' | 'warranty'
  
  if (source === 'mopar' && dataType === 'dashboard') {
    const data = await parseMoparDashboard(content);
    await updateVehicle(vehicleId, { dealerPortal: data });
  }
  
  if (source === 'mopar' && dataType === 'service_history') {
    const records = await parseMoparServiceHistory(content);
    await insertServiceRecords(vehicleId, records);
  }
  
  return { success: true, imported: data };
}

async function parseMoparDashboard(html: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `Extract from Mopar dashboard: mileage, warranty (dates/mileage), coverage plans, connected services, recalls. Return JSON.`;
  const result = await model.generateContent([prompt, html]);
  return JSON.parse(result.response.text());
}
```

**Implementation checklist:**

- [x] Add Gemini API client to `lib/parameterStore.ts` (GOOGLE_API_KEY)
- [x] Create `routes/importDealerData.ts` with Mopar parsers
  - `parseMoparDashboard()`: Extract mileage, warranty, coverage plans, connected services
  - `parseMoparServiceHistory()`: Parse service records table
- [x] Add DealerPortalData interface to `externalApis.ts`
  - Fields: source, lastSync, mileage, warranty, coveragePlans, connectedServices
- [x] Store results in MongoDB `vehicle.dealerPortal` (Pattern 2)
- [x] Add `POST /vehicles/:id/import-dealer-data` endpoint
- [x] Write tests (8 tests: 7 validation + 1 real data, all passing)
  - ✅ Real 2017 Jeep Cherokee data: 3,560 miles, warranty expired, TIRE WORKS plan
- [x] Add error handling for invalid JSON, missing fields, unsupported sources
- [x] Deploy Lambda (8.19 MB with @google/generative-ai)

**Storage Strategy:** MongoDB (Pattern 2 - mutable data)

- TTL: On-demand refresh (user triggers import manually)
- Size: ~2 KB per vehicle (dashboard), ~500 bytes per service record
- Fields: source, lastSync, mileage, mileageDate, warranty, coveragePlans, connectedServices

**Technology Stack:**

- **Gemini 2.0 Flash (text)**: Stable model, free-tier compatible, JSON output
- **MongoDB**: vehicle.dealerPortal field + events collection (service history)
- **Parameter Store**: GOOGLE_API_KEY for Gemini authentication

**Actual effort:** ~4 hours

- Research + KBB attempt: 2 hours (abandoned)
- Mopar parsers + route handler: 1.5 hours
- Tests + validation: 0.5 hours

**Advantages over KBB automation:**

- ✅ No bot detection - user-controlled
- ✅ No legal risk - user owns their own data
- ✅ MORE accurate - real mileage, not estimates
- ✅ Richer data - warranty, service history, coverage plans
- ✅ Multi-vendor extensible - Mopar today, GM/Ford/Toyota tomorrow
- ✅ Zero maintenance - no CSS selectors to break

**Test Results:**

```text
✓ should import real Mopar dashboard data (1986ms)
  Imported: { mileage: 1, warrantyUpdates: 1, coveragePlans: 1 }
  Parsed: 3,560 miles, basic warranty expired 09/23/2020
  Extracted: MOPAR TIRE WORKS (contract #53769698, expires 05/29/2026)
  Detected: Uconnect expired
```

**Future extensions:**

- GM OnStar portal integration
- Ford Pass integration
- Toyota Connected Services
- Service history auto-import from dealer emails (forwarding)

---

### ❌ Phase 12 (Original): AI-Powered Market Value Agent - ABANDONED

**Original Approach:** Browser automation + Gemini Vision for KBB scraping

**Why this approach:**

- ✅ **AI interprets pages** - no brittle CSS selectors
- ✅ **Adapts to UI changes** - AI reads like a human
- ✅ **Screenshot debugging** - visual validation
- ✅ **Free tier available** - Gemini 2.0 Flash Vision
- ✅ **Internal use only** - no legal/ToS concerns with public MCP server
- ✅ **Multi-source capable** - KBB, Edmunds, NADA in parallel

**Architecture:**

```typescript
// routes/getMarketValue.ts
async function getMarketValueHandler(vehicleId: string): Promise<MarketValueResponse> {
  // 1. Get vehicle specs from MongoDB
  const vehicle = await getVehicle(vehicleId);
  
  // 2. Launch headless browser (Playwright)
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 3. Navigate to KBB (or multiple sites)
  await page.goto(`https://www.kbb.com/[vin-lookup-url]`);
  await page.waitForLoadState('networkidle');
  
  // 4. Take full-page screenshot
  const screenshot = await page.screenshot({ 
    fullPage: true,
    path: `/tmp/kbb-${vehicleId}-${Date.now()}.png` // Debug artifact
  });
  
  // 5. Ask Gemini Vision to interpret
  const result = await geminiVisionClient.analyzeImage(screenshot, {
    prompt: `Extract vehicle market value data from this KBB page. Return JSON:
      { 
        fairMarketValue: number,
        tradeInValue: number,
        privatePartyValue: number,
        retailValue: number,
        mileageUsed: number,
        conditionAssumption: string,
        confidence: "high" | "medium" | "low",
        source: "kbb",
        fetchedAt: string
      }`
  });
  
  // 6. Store in MongoDB with TTL
  await updateVehicle(vehicleId, { 
    marketValue: result,
    marketValueFetchedAt: new Date()
  });
  
  await browser.close();
  return result;
}
```

**Proven Navigation Flow (Researched 2025-11-18):**

```text
1. Navigate: https://www.kbb.com/whats-my-car-worth/
2. Click VIN tab (three tabs: VIN | Make/Model | Plate)
3. Enter VIN in input[placeholder*="17-digit VIN"]
4. Click "Go" button
5. Wait for networkidle
6. Screenshot full page
7. Gemini Vision extracts: tradeInValue, privatePartyValue, retailValue, fairMarketRange
```

**Implementation checklist:**

- [ ] Add Playwright to dependencies (`npm install playwright`)
- [ ] Configure Gemini Vision API (already have Gemini API key)
- [ ] Create `lib/geminiVision.ts` helper for image analysis
- [ ] Create `routes/getMarketValue.ts` with browser automation
  - Navigate to KBB whats-my-car-worth
  - Click VIN tab, enter VIN, submit
  - Take full-page screenshot
  - Extract values with Gemini Vision
- [ ] Add vision analysis prompt with structured JSON schema
- [ ] Store results in MongoDB `vehicle.marketValue` with 30-day TTL
- [ ] Add `GET /vehicles/:id/market-value` endpoint
- [ ] Write tests (mock Playwright + Gemini Vision)
- [ ] Add error handling for timeouts, bot detection, captchas
- [ ] Optional: Try multiple sources (KBB, Edmunds) and average results
- [ ] Deploy Lambda with Playwright layer (or use AWS Lambda Playwright layer)

**Storage Strategy:** MongoDB + TTL (Pattern 2)

- TTL: 30 days (market values change monthly)
- Size: ~800 bytes per vehicle
- Fields: fairMarketValue, tradeInValue, privatePartyValue, retailValue, source, confidence

**Technology Stack:**

- **Playwright**: Headless Chrome automation (better than Puppeteer for stability)
- **Gemini 2.0 Flash Vision**: Free tier, fast vision interpretation
- **MongoDB**: 30-day TTL for automatic staleness handling
- **AWS Lambda**: May need increased timeout (60s → 90s) for browser launch

**Estimated effort:** 6-8 hours

- Playwright setup + browser automation: 2 hours
- Gemini Vision integration: 1.5 hours
- KBB navigation logic: 1.5 hours
- Route handler + MongoDB storage: 1 hour
- Tests + error handling: 2 hours
- Lambda deployment (Playwright layer): 1 hour

**Advantages over screen scraping:**

- No CSS selector maintenance (AI reads visually)
- Handles dynamic content naturally
- Fails gracefully with confidence scores
- Screenshot artifacts for debugging
- Can adapt to multiple sites with same code

**Considerations:**

- Lambda timeout: Increase to 90 seconds (browser launch ~5-10s)
- Lambda size: Playwright layer adds ~80 MB (within 250 MB limit)
- Rate limiting: Add exponential backoff for 429/bot detection
- Fallback: Manual input field if automation fails

**Alternative (if browser automation too complex):** Manual input field for market value (1-2 hours)

---

### 🔨 Phase 13: Market Value Field (Manual Fallback) - 1-2 hours

**Simple alternative if Phase 12 proves too complex:**

**Implementation:**

- [ ] Add `marketValue` field to vehicle schema (optional)
- [ ] Add manual input in frontend UI
- [ ] No API integration, user enters value manually
- [ ] Store with timestamp for tracking staleness

**Estimated effort:** 1-2 hours (schema update + UI field)

---

## Conversation History Implementation

### 🎯 Phase 14: AI Conversation Persistence - 4-6 hours

**Goal:** Store chat history with automatic cleanup (30-day TTL)

**Storage Strategy:** MongoDB + TTL indexes (auto-delete after 30 days)

**Collections:**

1. **`conversation_sessions`** - Metadata
2. **`conversation_messages`** - Individual prompts/responses

**Implementation checklist:**

- [ ] Create MongoDB collections with TTL indexes

  ```javascript
  db.createCollection('conversation_messages');
  db.conversation_messages.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
  
  db.createCollection('conversation_sessions');
  db.conversation_sessions.createIndex({ lastActiveAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days
  ```

- [ ] Update `aiChat.ts` to persist messages

  ```typescript
  // Before calling Gemini
  await db.collection('conversation_messages').insertOne({
    sessionId: new ObjectId(sessionId),
    vehicleId: new ObjectId(vehicleId),
    userId: event.requestContext.authorizer?.jwt.claims.sub,
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  });
  
  // After receiving response
  await db.collection('conversation_messages').insertOne({
    sessionId: new ObjectId(sessionId),
    vehicleId: new ObjectId(vehicleId),
    userId: event.requestContext.authorizer?.jwt.claims.sub,
    role: 'assistant',
    content: aiResponse,
    toolsUsed: functionsUsed,
    timestamp: new Date()
  });
  ```

- [ ] Add `GET /conversations/:sessionId/messages` endpoint
- [ ] Update session metadata on each message

  ```typescript
  await db.collection('conversation_sessions').updateOne(
    { _id: new ObjectId(sessionId) },
    { 
      $set: { lastActiveAt: new Date() },
      $inc: { messageCount: 1 }
    },
    { upsert: true }
  );
  ```

- [ ] Add conversation history to Gemini context

  ```typescript
  const history = await db.collection('conversation_messages')
    .find({ sessionId: new ObjectId(sessionId) })
    .sort({ timestamp: 1 })
    .limit(20) // Last 20 messages
    .toArray();
  
  const formattedHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  
  const result = await model.generateContent({
    contents: [...formattedHistory, { role: 'user', parts: [{ text: userMessage }] }],
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }]
  });
  ```

- [ ] Write tests for conversation persistence
- [ ] Update MongoDB init scripts (`init-collections.ts`)

**Estimated effort:** 4-6 hours

- Collection setup + indexes: 30 min
- Update `aiChat.ts`: 2 hours
- Add history context: 1 hour
- Add GET endpoint: 1 hour
- Tests: 1.5 hours

**Storage impact:** 1.8 MB for 10 active users (33% of free tier) - acceptable

---

## Implementation Sequence (Recommended)

### Sprint 1: Complete Milestone 4 (Chat Enhancement)

**Effort:** 4-6 hours
**Goal:** Production-ready AI chat with context persistence

1. ✅ Complete Phase 14 (Conversation History)
2. ✅ Test with real vehicle data
3. ✅ Commit: `feat(ai): add conversation history with 30-day TTL`

**Deliverables:**

- Persistent chat sessions
- AI remembers previous conversation
- Automatic cleanup (30/90-day TTL)
- `GET /conversations/:sessionId/messages` endpoint

---

### Sprint 2: Expand Vehicle Enrichment

**Effort:** 7-10 hours
**Goal:** Complete vehicle data enrichment suite

1. ✅ Phase 10: Fuel Economy (EPA)
2. ✅ Phase 11: NCAP Safety Ratings
3. 🔨 Phase 12: AI Market Value Agent (browser automation + vision)
4. ⏸️ Phase 13: Market Value Manual Field (fallback)

**Commits:**

- `feat(enrich): add EPA fuel economy data`
- `feat(safety): add NCAP safety ratings`
- `feat(vehicle): add market value field`

**Deliverables:**

- One-click vehicle enrichment (VIN → all data)
- Comprehensive vehicle profile (specs + safety + economy)
- Smart caching (immutable data stored permanently)

---

### Sprint 3: Frontend (Milestone 5)

**Effort:** 15-20 hours
**Goal:** User-facing React SPA

1. ✅ Vehicle timeline UI
2. ✅ Chat interface with streaming
3. ✅ Vehicle enrichment buttons
4. ✅ Safety dashboard

**Not started yet** - focus on completing backend first

---

## Testing Strategy

### Per-Phase Testing Checklist

For each new data source (Phases 10-12):

- [ ] **Unit tests** (2-3 tests per function)
  - Happy path with mock data
  - API error handling
  - Cache hit/miss scenarios
  
- [ ] **Integration tests** (1-2 tests)
  - Real API calls (with timeout: 15 seconds)
  - MongoDB persistence verification
  - TTL expiration simulation
  
- [ ] **Manual testing**
  - Use `backend/tests/test-endpoints.ts` pattern
  - Test with 2-3 real vehicles
  - Verify cache behavior (MISS → HIT)

### Test File Locations

```text
backend/src/
  lib/
    externalApis.test.ts     # Add EPA + NCAP tests
  routes/
    enrichVehicle.test.ts     # Update for fuel economy
    getVehicleSafety.test.ts  # Update for NCAP ratings
  api-integration.test.ts     # Add end-to-end tests
backend/tests/
  test-fuel-economy.ts        # Manual EPA test script
  test-ncap-ratings.ts        # Manual NCAP test script
```

---

## External API Documentation

### EPA Fuel Economy API

**Documentation:** <https://www.fueleconomy.gov/feg/ws/>
**Example request:**

```bash
# Step 1: Get vehicle ID by year/make/model
curl "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=2017&make=Jeep&model=Cherokee"

# Step 2: Fetch fuel economy by ID
curl "https://www.fueleconomy.gov/ws/rest/vehicle/40783"
```

**Response structure:**

```json
{
  "id": 40783,
  "year": 2017,
  "make": "Jeep",
  "model": "Cherokee",
  "city08": 21,
  "highway08": 29,
  "comb08": 24,
  "youSaveSpend": 1500,
  "co2TailpipeGpm": 370.9,
  "fuelCost08": 1950
}
```

---

### NHTSA NCAP Safety Ratings API

**Documentation:** <https://api.nhtsa.gov/products/vehicle/v-ratings>
**Example request:**

```bash
curl "https://api.nhtsa.gov/SafetyRatings/modelyear/2017/make/Jeep/model/Cherokee"
```

**Response structure:**

```json
{
  "Count": 1,
  "Results": [{
    "VehicleId": 9403,
    "OverallRating": "4",
    "FrontCrashRating": "4",
    "SideCrashRating": "5",
    "RolloverRating": "3",
    "RolloverRating2": "17.10%",
    "ComplaintsCount": 234,
    "RecallsCount": 6
  }]
}
```

---

## Pattern Library (Copy-Paste Templates)

### Pattern 1: Immutable External Data (VIN, EPA, NCAP)

```typescript
// In externalApis.ts
async getImmutableData(params): Promise<DataType> {
  const cacheKey = `type:${param1}:${param2}`;
  
  // Check memory cache (Lambda container)
  const cached = memoryCache.get<DataType>(cacheKey);
  if (cached) return cached;
  
  // Fetch from external API
  const data = await this.fetchFromAPI(params);
  
  // Cache in Lambda memory for 24 hours
  memoryCache.set(cacheKey, data, 24 * 60 * 60);
  
  return data;
  // Note: Caller stores in MongoDB permanently
}

// In route handler
const data = await externalClient.getImmutableData(params);
await vehiclesCollection.updateOne(
  { _id: new ObjectId(vehicleId) },
  { $set: { 'path.to.data': data, updatedAt: new Date() } }
);
```

---

### Pattern 2: Mutable External Data (Recalls, Market Value)

```typescript
// In externalApis.ts
async getMutableData(params): Promise<DataType> {
  const cacheKey = `type:${param1}:${param2}`;
  const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  
  // Check memory cache
  const cached = memoryCache.get<DataType>(cacheKey);
  if (cached) return cached;
  
  // Fetch from external API
  const data = await this.fetchFromAPI(params);
  
  // Cache in Lambda memory
  memoryCache.set(cacheKey, data, TTL_SECONDS);
  
  return data;
}

// In route handler
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ttlAgo = new Date(Date.now() - TTL_MS);

// Check if data is stale
if (!vehicle.data?.lastChecked || vehicle.data.lastChecked < ttlAgo) {
  const freshData = await externalClient.getMutableData(params);
  await vehiclesCollection.updateOne(
    { _id: new ObjectId(vehicleId) },
    { $set: { 'path.to.data': freshData, 'path.to.data.lastChecked': new Date() } }
  );
}

// Return (possibly refreshed) data
return vehicle.data;
```

---

### Pattern 3: Large Ephemeral Data (Complaints)

```typescript
// In externalApis.ts
async getLargeDataset(params): Promise<DataType[]> {
  const cacheKey = `type:${param1}:${param2}`;
  const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
  
  // Check memory cache only
  const cached = memoryCache.get<DataType[]>(cacheKey);
  if (cached) return cached;
  
  // Fetch from external API
  const data = await this.fetchFromAPI(params);
  
  // Cache in Lambda memory (no MongoDB)
  memoryCache.set(cacheKey, data, TTL_SECONDS);
  
  return data;
}

// In route handler
const data = await externalClient.getLargeDataset(params);
// Return immediately, no MongoDB storage
return { statusCode: 200, body: JSON.stringify({ data }) };
```

---

## Success Metrics

### Per-Phase Validation

- [ ] All tests passing (`npm test`)
- [ ] Lint + typecheck clean (`npm run lint && npm run typecheck`)
- [ ] Manual testing with 2+ real vehicles
- [ ] Cache behavior verified (MISS → HIT logged)
- [ ] MongoDB storage confirmed (`db.vehicles.findOne()`)
- [ ] API response time <2 seconds (excluding cold start)

### Overall Success (All Phases Complete)

- [ ] **External data sources:** 5 of 5 implemented (VIN, Recalls, Complaints, EPA, NCAP)
- [ ] **Conversation history:** Persistent with TTL cleanup
- [ ] **Storage usage:** <50% of free tier (256 MB)
- [ ] **Test coverage:** 80%+ (unit + integration)
- [ ] **API response time:** <500ms (warm Lambda)
- [ ] **Documentation:** All APIs documented in `docs/`

---

## Cost & Risk Analysis

### Storage Cost (MongoDB Atlas M0 Free Tier)

| Data Type | Per Vehicle | 10 Vehicles | 50 Vehicles | 100 Vehicles |
|-----------|-------------|-------------|-------------|--------------|
| VIN Specs | 3 KB | 30 KB | 150 KB | 300 KB |
| Recalls | 10 KB | 100 KB | 500 KB | 1 MB |
| EPA | 1 KB | 10 KB | 50 KB | 100 KB |
| NCAP | 2 KB | 20 KB | 100 KB | 200 KB |
| Events (500 each) | 110 KB | 1.1 MB | 5.5 MB | 11 MB |
| Conversations (10 users) | - | 1.8 MB | 1.8 MB | 1.8 MB |
| **Total** | **126 KB** | **3.1 MB** | **8.1 MB** | **14.4 MB** |
| **% of 512 MB** | **<1%** | **6%** | **16%** | **28%** |

**Verdict:** ✅ Comfortable headroom for 100 vehicles on free tier

### API Rate Limits

| API | Rate Limit | Cost | Risk |
|-----|------------|------|------|
| NHTSA vPIC | None documented | Free | ✅ Low |
| NHTSA Recalls | None documented | Free | ✅ Low |
| NHTSA Complaints | None documented | Free | ✅ Low |
| NHTSA NCAP | None documented | Free | ✅ Low |
| EPA Fuel Economy | None documented | Free | ✅ Low |

**Mitigation:** All APIs cached in Lambda memory (15-45 min), MongoDB persistent storage reduces API calls by 90%+

---

## Next Steps

1. **Review this plan** - Confirm sequence and priorities
2. **Choose Sprint** - Start with Sprint 1 (Conversation History) or Sprint 2 (Enrichment)?
3. **Implement Phase-by-Phase** - Follow checklist, commit incrementally
4. **Test thoroughly** - Unit + integration + manual testing per phase
5. **Deploy & validate** - Push to AWS after each phase

**Ready to start? Which phase would you like to tackle first?**

Options:

- **A) Phase 13 (Conversation History)** - Completes Milestone 4, 4-6 hours
- **B) Phase 10 (EPA Fuel Economy)** - Quick win, 4-6 hours
- **C) Review GitHub outage status** - Try pushing Phase 9 commit first

**Your call!** 🚀
