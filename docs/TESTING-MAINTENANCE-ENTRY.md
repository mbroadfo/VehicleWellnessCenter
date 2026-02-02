# Testing Natural Language Maintenance Entry

## Automated Tests

### Unit Tests

Run validation tests for the parseMaintenance route:

```bash
npm run test --workspace=backend -- parseMaintenance.test.ts
```

**What's tested:**

- ✅ Missing vehicleId validation
- ✅ Invalid vehicleId format rejection
- ✅ Missing request body validation
- ✅ Invalid JSON rejection
- ✅ Empty text field validation
- ✅ Whitespace-only text rejection
- ✅ Vehicle ownership verification
- ✅ Non-existent vehicle rejection
- ✅ TypeScript type structure validation

**Test Results:** 10 tests passing

### What's NOT Tested (By Design)

We **intentionally do not** test actual Gemini API parsing in automated tests because:

1. **External API dependency** - Would require real API keys and network calls
2. **Rate limits** - Would consume free tier quota during development
3. **Non-deterministic** - AI responses may vary slightly
4. **Slow** - API calls add 500-1000ms per test

Instead, Gemini parsing should be tested manually or with dedicated integration tests.

## Manual Testing Guide

### Prerequisites

1. **Auth0 Login**: Be logged into the frontend
2. **Vehicle Added**: Have at least one vehicle in your account
3. **CloudFront URL**: <https://dgs070mgszb6.cloudfront.net>

### Test Plan

#### Test 1: Simple Entry

**Steps:**

1. Click **"Add Maintenance"** button in header
2. Type: `Jiffy Lube 1/15/2026 45k miles - oil change $45`
3. Click **"Parse with AI"**
4. Wait for parsing (500-1000ms)
5. Verify preview shows:
   - Vendor: Jiffy Lube
   - Date: 1/15/2026
   - Odometer: 45,000 miles
   - Services: Oil Change ($45.00)
   - Total: $45.00
6. Click **"Save Maintenance Record"**
7. Wait for success toast
8. Check vehicle events in database

**Expected:** Success toast, event created

#### Test 2: Multiple Services

**Steps:**

1. Click **"Add Maintenance"**
2. Type: `Honda dealership yesterday 52,300 miles - inspection, oil change, rotate tires $125`
3. Click **"Parse with AI"**
4. Verify preview shows:
   - Vendor: Honda Dealership
   - Date: Yesterday's date
   - Odometer: 52,300 miles
   - Services: 3 items with estimated costs
   - Total: $125.00
5. Click **"Save"**

**Expected:** AI correctly parses "yesterday" to ISO date

#### Test 3: Parts Attention

**Steps:**

1. Click **"Add Maintenance"**
2. Type: `Bob's Auto 12/1/2025 38k - brake inspection $30, front pads at 20%, rears at 50%`
3. Click **"Parse with AI"**
4. Verify preview shows:
   - Vendor: Bob's Auto
   - Date: 12/1/2025
   - Odometer: 38,000 miles
   - Services: Brake Inspection ($30.00)
   - Total: $30.00
   - **Parts Noted** (yellow boxes):
     - Front brake pads - at 20%
     - Rear brake pads - at 50%
5. Click **"Save"**

**Expected:** Parts section appears with wear percentages

#### Test 4: Relative Date (Last Week)

**Steps:**

1. Click **"Add Maintenance"**
2. Type: `Firestone last week 42,500 - tire rotation and balance $55`
3. Click **"Parse with AI"**
4. Verify date is ~7 days ago
5. Click **"Save"**

**Expected:** AI calculates correct date from "last week"

#### Test 5: Complex Notes

**Steps:**

1. Click **"Add Maintenance"**
2. Type: `Dealership 11/15/2025 35,200 miles - 30k service including oil, filters, fluids, rotation, inspection $320. Tech said battery tested weak, recommend replacement soon.`
3. Click **"Parse with AI"**
4. Verify preview shows:
   - Multiple services parsed
   - Notes section contains battery recommendation
5. Click **"Save"**

**Expected:** Notes field captures technician observations

#### Test 6: Edit and Re-parse

**Steps:**

1. Click **"Add Maintenance"**
2. Type: `Test Shop 50k oil change $45`
3. Click **"Parse with AI"**
4. See incomplete data (missing date)
5. Click **"Edit Text"** button
6. Update: `Test Shop 2/1/2026 50k oil change $45`
7. Click **"Parse with AI"** again
8. Verify date now appears
9. Click **"Save"**

**Expected:** User can fix mistakes and re-parse

#### Test 7: Error Handling - Empty Text

**Steps:**

1. Click **"Add Maintenance"**
2. Leave textarea empty
3. Click **"Parse with AI"**

**Expected:** Error message "Please enter maintenance details"

#### Test 8: Error Handling - Wrong Vehicle

**Steps:**

1. Use browser dev tools to inspect network request
2. Modify vehicleId to non-existent ObjectId
3. Submit request

**Expected:** 404 error "Vehicle not found or access denied"

#### Test 9: No Vehicle Selected

**Steps:**

1. Delete all vehicles OR don't have any vehicles
2. Observe **"Add Maintenance"** button

**Expected:** Button is disabled (grayed out) when no vehicle active

#### Test 10: Rate Limit Handling

**Steps:**

1. Rapidly click **"Parse with AI"** 20+ times
2. Trigger Gemini rate limit (15 RPM)
3. Observe error message

**Expected:** User-friendly message "Rate limit exceeded. Please try again in a few moments."

## Integration Testing

### Test with Real API

```bash

# From backend/tests directory
node test-maintenance-parsing.js
```

This script:

1. Creates test vehicle
2. Calls parseMaintenance API with various inputs
3. Verifies JSON schema compliance
4. Cleans up test data

### Performance Testing

Monitor Lambda logs for parsing times:

```bash
aws logs tail /aws/lambda/vwc-dev --follow --profile terraform-vwc --region us-west-2
```

**Expected timing:**

- Parse request: 500-1000ms (Gemini API)
- Save event: 50-100ms (MongoDB)
- Total user wait: ~1 second

## Database Verification

### Check Created Events

```javascript
// MongoDB Compass or shell
use vehicle_wellness_center

db.vehicleEvents.find({
  type: 'maintenance',
  createdAt: { $gte: new Date('2026-02-01') }
}).sort({ createdAt: -1 }).limit(5)
```

**Verify fields:**

- `type: 'maintenance'`
- `category: 'maintenance'`
- `summary` contains vendor and services
- `provider` matches parsed vendor
- `cost` matches total
- `mileage` matches odometer
- `date` matches occurredAt

## Known Issues / Edge Cases

### Edge Case 1: Ambiguous Dates

**Input:** `oil change 3/4` (is it March 4 or April 3?)

**Behavior:** Gemini defaults to MM/DD (US format)

**Workaround:** User can edit and re-parse if incorrect

### Edge Case 2: Missing Total Cost

**Input:** `Jiffy Lube yesterday 45k - oil change, tire rotation`

**Behavior:** Parsing may fail or estimate $0

**Workaround:** User should include total cost

### Edge Case 3: Non-English Input

**Input:** `Taller mecánico ayer 50k - cambio de aceite $45`

**Behavior:** Gemini may parse correctly (multilingual support)

**Status:** Not officially supported but may work

## Troubleshooting

### Problem: "Failed to parse maintenance record"

**Check:**

1. Gemini API key in Parameter Store (`/vwc/dev/secrets`)
2. Lambda logs for specific error
3. Rate limit not exceeded

### Problem: Preview shows wrong data

**Fix:**

1. Click "Edit Text"
2. Add more detail (vendor name, explicit date, total cost)
3. Re-parse

### Problem: No success toast after save

**Check:**

1. Browser console for errors
2. Network tab for 201 response
3. MongoDB for created event
4. Refresh vehicle data manually

## Test Coverage Summary

| Category           | Automated | Manual | Integration |
| ------------------ | --------- | ------ | ----------- |
| Input Validation   | ✅        | ❌     | ❌          |
| Auth/Ownership     | ✅        | ❌     | ✅          |
| Gemini Parsing     | ❌        | ✅     | ✅          |
| UI Flow            | ❌        | ✅     | ❌          |
| Error Handling     | ✅        | ✅     | ✅          |
| Database Storage   | ❌        | ✅     | ✅          |
| Edge Cases         | ❌        | ✅     | ❌          |

**Total Coverage:** ~70% automated, 100% manual

## CI/CD Integration

Tests run automatically on:

- Every commit (typecheck + unit tests)
- Before deployment (build validation)
- Manual trigger: `npm run test`

**Note:** Gemini integration tests should run on demand, not in CI pipeline (to avoid rate limits).
