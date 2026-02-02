# Dealer Maintenance Import Guide

## Overview

Vehicle Wellness Center supports importing dealer maintenance records from authorized dealer portals through a copy/paste approach. This avoids the complexity and legal issues of API integrations or browser automation.

## Supported Dealers

### Currently Supported
- **Mopar** (Jeep, Chrysler, Dodge, Ram, Fiat, Alfa Romeo)
- **Honda** (Honda, Acura)

### Future Support
- GM (Chevrolet, GMC, Buick, Cadillac)
- Ford/Lincoln
- Toyota/Lexus

## How It Works

1. **User logs into dealer portal** using their credentials
2. **User navigates to service history** section
3. **User copies the HTML content** (Ctrl+A, Ctrl+C or select all and copy)
4. **User pastes into VWC** through the import UI or API
5. **Gemini AI parses the content** and extracts structured maintenance records
6. **Records are created as vehicle events** in MongoDB

## Data Extracted

### Common Fields (All Dealers)
- **Date**: Service date
- **Mileage**: Odometer reading at time of service
- **Description**: Primary service description
- **Provider**: Dealer/shop name
- **Repair Order Number**: RO# for reference

### Enhanced Fields (When Available)
- **Services**: Array of individual service items performed
- **Parts**: Array of parts used with part numbers
- **Labor**: Labor charges (if available)
- **Costs**: Service costs (if available)

## API Usage

### Endpoint
```
POST /vehicles/{vehicleId}/import-dealer-data
```

### Request Body
```json
{
  "source": "mopar" | "honda",
  "dataType": "service_history",
  "content": "<HTML content pasted from dealer portal>"
}
```

### Response
```json
{
  "success": true,
  "message": "Successfully imported service_history data from honda",
  "importedData": {
    "serviceRecords": 15
  }
}
```

## Mopar Import

### Accessing Mopar Service History
1. Go to https://www.mopar.com/
2. Click "Sign In" (top right)
3. Sign in with your Mopar account
4. Navigate to "Service" → "Maintenance Records"
5. Click "Print All" for complete records
6. Copy the entire page content

### Mopar Data Format
Mopar provides records in a table format:
- Date (MM-DD-YYYY)
- Description (may be truncated with "See more")
- Provider (Dealer name)
- Odometer (mileage)
- Dealer Record (YES/NO flag)

### Example Mopar Record
```
Date: 11-25-2025
Description: Mopar Express Lane Oil Rotate/Balance Wheels Vehicle I...
Provider: Fowler Jeep of Boulder
Odometer: 42875
Dealer Record: YES
```

## Honda Import

### Accessing Honda Service Records
1. Go to https://owners.honda.com/
2. Sign in with your Honda account
3. Select your vehicle
4. Navigate to "My Service Records"
5. Copy the entire page content (including VIEW buttons)
6. Optionally, click "VIEW" on individual records for detailed parts breakdown

### Honda Data Format
Honda provides two levels of detail:

**List View:**
- Date of Service (MM/DD/YYYY)
- Mileage
- Services (comma-separated list)
- Repair Order #

**Detail View (Enhanced):**
- All list view fields plus:
- Job breakdown with service codes
- Part names with part numbers
- Service categories

### Example Honda Record (List View)
```
Date of Service: 11/07/2025
Mileage: 62,117
Services: PREPAID LOF PURCHASE, PREPAID OIL CHANGE 1, MULTI POINT INSPECT, 
          TIRE ROTATION, REAR DIFF SVC, BRAKE FLUID, ALIGNMENT 4 WHEEL
Repair Order #: 931589
```

### Example Honda Record (Detail View)
```
Service Date: 11/07/2025
Miles: 62,117
Repair Order #: 931589

Job 02: PREPAID OIL CHANGE 1
- FILTER, ENGINE OIL (15400-PLM-A02)
- WASHER (94109-14000)

Job 10: REAR DIFF SVC
- OIL,ATF (08200-9007)
- WASHER (94109-20000)

Job 11: BRAKE FLUID
- BRAKE FLUID (08798-9108)
```

## Testing Import Locally

### 1. Prepare Your Data

Create a file with pasted HTML content:
```bash

# For Honda
backend/tests/honda-sample.html

# For Mopar
backend/tests/mopar-sample.html
```

### 2. Set Environment Variables

```bash
export VEHICLE_ID="your-vehicle-mongodb-id"
export HONDA_CONTENT="backend/tests/honda-sample.html"
```

### 3. Run Test Script

```bash
cd backend
npm run test:honda-import
```

The script will:
- Verify vehicle exists
- Send content to Gemini for parsing
- Create events in MongoDB
- Display summary of imported records

## Event Storage

Imported records are stored as events in the `events` collection:

```json
{
  "vehicleId": ObjectId("..."),
  "type": "service",
  "category": "maintenance",
  "date": ISODate("2025-11-07T00:00:00Z"),
  "mileage": 62117,
  "description": "Oil change and tire rotation",
  "provider": "Honda Dealer",
  "source": "honda_import",
  "repairOrderNumber": "931589",
  "details": {
    "services": [
      "PREPAID OIL CHANGE 1",
      "TIRE ROTATION",
      "REAR DIFF SVC"
    ],
    "parts": [
      {
        "name": "FILTER, ENGINE OIL",
        "partNumber": "15400-PLM-A02"
      },
      {
        "name": "OIL,ATF",
        "partNumber": "08200-9007"
      }
    ]
  },
  "importedAt": ISODate("2025-12-28T...")
}
```

## Deduplication

Currently, the system does not automatically deduplicate records. If you import the same data twice, duplicate events will be created.

**Best Practices:**
- Import full history once during initial setup
- Periodically import only new records (not available yet)
- Use RO numbers to manually check for duplicates

**Future Enhancement:**
We plan to add automatic deduplication based on:
- Date + VIN + RO number
- Show warning before creating duplicates
- User confirmation option

## AI Parsing Reliability

The Gemini AI parser is designed to handle variations in HTML formatting across dealer portals. However:

### Expected Accuracy
- **Date extraction**: 95%+ (standardized formats)
- **Mileage extraction**: 90%+ (may miss if formatted oddly)
- **Service description**: 85%+ (depends on portal formatting)
- **Parts extraction**: 80%+ (only when detailed view is available)

### Known Limitations
- Cannot extract data not present in HTML (costs, labor hours)
- May struggle with heavily JavaScript-rendered pages
- Part numbers may be missed if not clearly labeled

### Improving Results
To maximize import accuracy:
1. Use "Print All" or "View All" options when available
2. Click "View Details" for enhanced records (Honda)
3. Ensure page is fully loaded before copying
4. Include surrounding context (headers, labels)

## Security Considerations

### Why Copy/Paste?
- **No stored credentials**: User logs in themselves
- **No bot detection**: Uses legitimate user session
- **Legal compliance**: No terms of service violations
- **Privacy**: User controls what data is shared
- **Reliability**: Works even if dealer changes API/website

### Data Privacy
- Pasted HTML is sent to Gemini for parsing
- Google's Gemini terms apply (data not used for training on paid tiers)
- Extracted data is stored in your MongoDB instance
- No third-party has persistent access to your dealer portal

## Troubleshooting

### Import Returns No Records
- **Check content length**: Should be several KB, not just a few lines
- **Try Print All**: Some portals truncate list views
- **Include table headers**: Helps Gemini identify fields
- **Check for JavaScript**: Page may need to fully load

### Wrong Date Format
- Gemini auto-detects MM-DD-YYYY (US) and DD-MM-YYYY (international)
- If dates are wrong, check the source format
- You can manually correct in MongoDB if needed

### Missing Parts Information
- Parts are only extracted from detail views
- Mopar "Print All" may not include parts
- Honda requires clicking "VIEW" for parts breakdown
- Consider copying individual records for parts data

### "GOOGLE_API_KEY not configured" Error
- Ensure Parameter Store has `/vwc/dev/secrets` with `GOOGLE_API_KEY`
- Lambda needs IAM permission to read Parameter Store
- See `docs/parameter-store-setup.md`

## Future Enhancements

### Planned Features
- [ ] Automatic deduplication by RO number
- [ ] Cost extraction (when available in HTML)
- [ ] Labor hours tracking
- [ ] Multi-vehicle bulk import
- [ ] Import scheduling reminders
- [ ] Partial import (only new records since last import)

### Additional Dealers
- [ ] GM (OnStar portal integration)
- [ ] Ford (FordPass integration)
- [ ] Toyota (Toyota Owners integration)
- [ ] Subaru (MySubaru integration)
- [ ] Generic dealer portal parser (fallback)

## API Gateway Route

The import endpoint is configured in Terraform:

```hcl
resource "aws_apigatewayv2_route" "import_dealer_data" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /vehicles/{id}/import-dealer-data"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}
```

## Related Documentation

- [Data Model](./data-model.md) - Vehicle and event schema
- [Parameter Store Setup](./parameter-store-setup.md) - Secrets configuration
- [API Integration Layer](./AI_INTEGRATION_LAYER_PROPOSAL.md) - AI chat features
