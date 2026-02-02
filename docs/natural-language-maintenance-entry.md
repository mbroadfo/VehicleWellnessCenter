# Natural Language Maintenance Entry

## Overview

Fast, elegant maintenance record entry using natural language instead of forms. Perfect for users with stacks of maintenance receipts who want to quickly digitize their vehicle history.

## User Experience

### 1. Click "Add Maintenance" Button

Located in the header next to "Add Vehicle" (only visible when vehicle is selected).

### 2. Type Natural Language Description

```text
Jiffy Lube 1/15/2026 45k miles - oil change, tire rotation, cabin filter $125
```

or

```text
Honda dealership yesterday 52,300 miles inspection and oil change $89 - they said brake pads at 30%
```

### 3. AI Parses to Structured Data

Gemini 2.0 Flash extracts:

- **Vendor**: Jiffy Lube
- **Date**: 2026-01-15 (ISO 8601)
- **Odometer**: 45,000 miles
- **Services**: Oil Change, Tire Rotation, Cabin Air Filter
- **Total**: $125.00
- **Parts Noted**: (if mentioned)

### 4. Review & Confirm

Preview shows:

- All parsed fields in structured format
- Service breakdown with individual costs (estimated if not itemized)
- Parts that warrant attention (highlighted in yellow)
- Notes section

### 5. Save to Vehicle History

Creates vehicle event with:

- Type: `maintenance`
- Category: `maintenance`
- All parsed details stored
- Instantly visible in chat AI context

## Architecture

### Backend

**Route**: `POST /vehicles/{vehicleId}/events/parse-maintenance`

**Handler**: `backend/src/routes/parseMaintenance.ts`

- Uses Gemini structured output (not function calling)
- JSON schema validation ensures reliable parsing
- Verifies vehicle ownership before processing
- Returns structured JSON for frontend preview

**Schema**: `backend/src/lib/maintenanceTypes.ts`

```typescript
interface ParsedMaintenanceRecord {
  vendor: string;
  date: string; // ISO 8601
  odometer: number;
  services: MaintenanceService[];
  total: number;
  parts?: MaintenancePart[];
  notes?: string;
}
```

### Frontend

**Component**: `frontend/src/components/AddMaintenanceModal.tsx`

- Two-phase flow: Parse → Preview → Save
- Textarea for natural language input
- Structured preview with edit capability
- Loading states with spinners
- Error handling with user-friendly messages

**Integration**: `frontend/src/App.tsx`

- Button in header (disabled when no vehicle)
- Modal state management
- Success toast notification
- Auto-refresh vehicle data after save

## Parsing Intelligence

### Date Handling

- **Formats**: `1/15/2026`, `Jan 15 2026`, `January 15, 2026`
- **Relative**: `yesterday`, `last week`, `two weeks ago`
- **Output**: ISO 8601 (`2026-01-15T00:00:00Z`)

### Mileage Handling

- **Formats**: `45k`, `45,000`, `45k miles`, `45000 mi`
- **Output**: Integer (45000)

### Service Name Standardization

- `oil change` → `Oil Change` (title case)
- `brakes` → `Brake Service`
- `new tires` → `Tire Replacement`
- `inspection` → `Multi-Point Inspection`

### Cost Distribution

- If total given without itemization, AI estimates proportional costs
- Example: `$125` total → Oil Change $45, Tire Rotation $40, Filter $40
- Always positive numbers, always decimal format

### Parts Detection

- Looks for phrases: `replaced X`, `worn X`, `at Y%`
- Examples:
  - `"replaced air filter"` → Part: Air Filter, Notes: replaced
  - `"brake pads at 30%"` → Part: Brake Pads, Notes: at 30%

## Benefits vs Traditional Forms

| Traditional Form         | Natural Language       |
| ------------------------ | ---------------------- |
| 10+ fields to fill       | Single textarea        |
| Date picker required     | "yesterday" works      |
| Dropdown menus           | Free text              |
| Manual cost breakdown    | AI estimates if needed |
| 2-3 minutes per record   | 20-30 seconds          |
| Mental context switching | Continuous flow        |

## Example Use Cases

### Quick Entry from Receipt Stack

```text
Bob's Auto 12/1/2025 38k - inspection, wiper blades, topped off fluids $45
```

### Complex Service with Notes

```text
Dealership 11/15/2025 35,200 miles - 30k service, transmission flush, coolant flush $320. Tech said battery tested weak, recommend replacement soon.
```

### Parts Attention Tracking

```text
Firestone 10/8/2025 32k - tire rotation $40. Front tires at 4/32", rears at 6/32"
```

- Take photo of receipt
- AI extracts all data from image
- Even faster than typing

### Bulk Import

- Process multiple receipts in one session
- CSV export from dealer portals
- Integration with OBD-II apps

### Cost Tracking

- Aggregate maintenance costs over time
- Category breakdowns (oil changes, tires, brakes)
- Annual cost projections

## Error Handling

### Rate Limits

- Gemini free tier: 15 RPM, 1500 RPD
- 429 errors show user-friendly message
- Suggests retry in 20 seconds

### Parsing Failures

- Shows specific error from AI
- User can edit text and retry
- No data loss on errors

### Validation

- Requires vehicleId (authenticated)
- Verifies vehicle ownership
- Ensures text field not empty

## Testing

### Manual Test Script

1. Add maintenance button appears in header
2. Click → modal opens
3. Type: `"Test Shop 2/1/2026 50k - oil change $50"`
4. Click "Parse with AI" → spinner shows
5. Preview appears with all fields populated
6. Click "Save" → toast notification
7. Check vehicle history for new event

### Test Data Examples

```textCheck vehicle history for new event

```text

## Simple
Jiffy Lube 1/15/2026 45k miles - oil change $45

## Multiple services
Honda dealership yesterday 52,300 miles - inspection, oil change, rotate tires $125

## With parts noted
Bob's Auto 12/1/2025 38k - brake inspection $30, front pads at 20%, rears at 50%

## Relative dates
Firestone last week 42,500 - tire rotation and balance $55

#Firestone last week 42,500 - tire rotation and balance $55

# Complex notes
Dealership 11/15/2025 35,200 miles - 30k service including oil, filters, fluids, rotation, inspection $320. Tech recommends battery replacement within 6 months.
```

## Deployment

```bash
npm run deploy:backend
```

Frontend modal included in CloudFront deployment:

Frontend modal included in CloudFront deployment:

```bash
npm run deploy:frontend
```

## Cost Impact

- **Gemini API**: Free tier (15 RPM / 1500 RPD)
- **Lambda**: ~50ms execution time per parse
- **Storage**: ~1-2KB per maintenance record
- **No additional infrastructure** required

Estimated cost for 100 maintenance entries/month: **$0.00** (well within free tiers)
