# API Integration Tests

Comprehensive end-to-end test suite for the Vehicle Wellness Center API.

## Overview

This test suite validates the complete API lifecycle:

1. **Phase 1: Create Test Data** - Creates a vehicle and multiple events via POST API
2. **Phase 2: Read and Validate** - Fetches data via GET endpoints and validates responses
3. **Phase 3: Update Test Data** - Adds more events and verifies updates
4. **Phase 4: Validation Tests** - Tests authentication, error handling, and edge cases
5. **Phase 5: Cleanup** - Removes all test data from MongoDB

## Prerequisites

- Infrastructure deployed (Lambda functions, API Gateway, MongoDB Atlas)
- Auth0 tenant configured with M2M application
- Auth0 M2M credentials stored in AWS Secrets Manager (`AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_CLIENT_SECRET`)
- AWS credentials available (`terraform-vwc` profile)

## Running the Tests

Tests automatically retrieve Auth0 tokens using the Client Credentials flow. No manual token setup required!

```powershell
# From root
npm run test

# Or from backend directory
cd backend
npm run test
```

The tests will:

1. Automatically fetch an Auth0 token using M2M credentials from AWS Secrets Manager
2. Run all integration tests with the token
3. Clean up test data when complete

## Test Coverage

### API Endpoints Tested

- `POST /vehicles/{vehicleId}/events` - Create vehicle events
- `GET /vehicles/{vehicleId}/overview` - Get vehicle summary
- `GET /vehicles/{vehicleId}/events` - List all vehicle events

### Scenarios Covered

✅ **Happy Path**

- Create vehicle and events
- Fetch data via GET endpoints
- Verify data integrity and sorting
- Update data and verify changes

✅ **Authentication**

- Reject requests without Auth0 token (401)
- Accept requests with valid Auth0 token

✅ **Validation**

- Missing required fields (400)
- Invalid date formats (400)
- Negative cost values (400)
- Non-existent vehicles (404)

✅ **Data Integrity**

- Events sorted by date (newest first)
- Event count accuracy
- All created events retrievable
- Clean test data removal

## Test Structure

```typescript
describe('API Integration Test Suite', () => {
  // Creates vehicle via MongoDB
  // Creates events via POST API
  // Validates via GET APIs
  // Tests error scenarios
  // Cleans up all test data
});
```

### Test Phases

1. **Create Test Data** (4 tests)
   - Vehicle creation via MongoDB
   - 3 events via POST API

2. **Read and Validate** (2 tests)
   - GET vehicle overview
   - GET all events with pagination

3. **Update Test Data** (2 tests)
   - Add 4th event
   - Verify updated count

4. **Validation Tests** (6 tests)
   - No auth → 401
   - Missing field → 400
   - Invalid date → 400
   - Negative cost → 400
   - Non-existent vehicle → 404
   - GET without auth → 401

5. **Cleanup** (3 tests)
   - Delete all events
   - Delete vehicle
   - Verify cleanup

## Example Output

```text
🔗 Testing API: https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com

Phase 1: Create Test Data
  📝 Created vehicle: 69164b19041ff390fdb7128c
  📝 Created event 1: 69164b183cf4a244e7872def
  📝 Created event 2: 69164b183cf4a244e7872df0
  📝 Created event 3: 69164b183cf4a244e7872df1
  ✅ Created 3 events total

Phase 2: Read and Validate Data
  ✅ Overview: 2023 Tesla Model 3
  ✅ Event count: 3
  ✅ Fetched 3 events
  ✅ Events sorted by date (newest first)
  ✅ All created events present in response

Phase 3: Update Test Data
  📝 Created event 4: 69164b183cf4a244e7872df2
  ✅ Updated event count: 4 events

Phase 4: Validation Tests
  ✅ Rejected unauthenticated POST request
  ✅ Rejected POST with missing required field
  ✅ Rejected POST with invalid date format
  ✅ Rejected POST with negative cost
  ✅ Rejected POST to non-existent vehicle
  ✅ Rejected unauthenticated GET request

Phase 5: Cleanup
  🧹 Deleted 4 events
  🧹 Deleted 1 vehicle
  ✅ Cleanup verified: no test data remaining

✓ 17 tests passed in 2.55s
```

## Troubleshooting

### Token Expired

Auth0 tokens expire after 24 hours. Get a fresh token from the Auth0 dashboard.

```powershell
# Error: {"message":"Unauthorized"}
# Solution: Get new token from Auth0
```

### AWS Credentials

Ensure `terraform-vwc` profile is configured:

```powershell
aws configure --profile terraform-vwc
```

### MongoDB Connection

Tests require AWS Parameter Store access for MongoDB credentials:

```powershell
# Verify parameter access
aws ssm get-parameter `
  --name /vwc/dev/secrets `
  --with-decryption `
  --profile terraform-vwc
```

## CI/CD Integration

Add to CI pipeline:

```yaml
- name: Run Integration Tests
  env:
    AWS_PROFILE: terraform-vwc
    AWS_REGION: us-west-2
    AUTH0_TOKEN: ${{ secrets.AUTH0_TEST_TOKEN }}
  run: |
    cd backend
    npm run test:integration
```

## Notes

- Tests create and clean up their own data
- Each test run uses a unique vehicle VIN (timestamp-based)
- Tests run sequentially to maintain data consistency
- Cleanup runs even if tests fail (via `afterAll` hook)
- Tests are safe to run multiple times without side effects
