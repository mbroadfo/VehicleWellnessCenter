# Backend

Node.js AWS Lambda handlers for Vehicle Wellness Center. Functions orchestrate vehicle maintenance workflows, integrate with MongoDB Atlas, and expose APIs via API Gateway.

## Development Commands

**Note:** Run all commands from the project root using npm workspaces.

### Build

```powershell
npm run build:backend      # Compile TypeScript to dist/
```

### Test

```powershell
npm run test:backend       # Run unit tests with Vitest
npm run test:backend:watch # Run tests in watch mode
npm run test:connection    # Test MongoDB Atlas connection via Secrets Manager
npm run seed:test          # Seed test data for API validation (auto-cleans after 3s)
```

### Lint & Type Check

```powershell
npm run lint:backend       # Lint with ESLint
npm run typecheck:backend  # Type check with TypeScript compiler
```

## Lambda Functions

Lambda functions use IAM role-based authentication and retrieve MongoDB credentials from AWS Secrets Manager at runtime. All API endpoints are protected with Auth0 JWT authentication - valid tokens required in `Authorization: Bearer <token>` header.

### Implemented Functions

- **getVehicleOverview** (`src/getVehicleOverview.ts`) – Retrieve vehicle details, event count, and recent events
  - Route: `GET /vehicles/{vehicleId}/overview`
  - Returns: Vehicle details + last 5 events
  - Validates ObjectId format, handles 400/404/500 errors

- **listVehicleEvents** (`src/listVehicleEvents.ts`) – Query vehicle events with pagination and filtering
  - Route: `GET /vehicles/{vehicleId}/events?limit=10&offset=0&type=oil_change`
  - Query params: `limit` (1-100, default 10), `offset` (default 0), `type` (optional filter)
  - Returns: Paginated events sorted by date (newest first)
  - Includes pagination metadata: totalCount, hasMore, nextOffset
  - Validates vehicleId and query parameters

### Planned Functions

- **recordVehicleEvent** – Create new maintenance/incident records
- **chatVehicleHistory** – AI-powered conversational vehicle insights

## MongoDB Connection

All Lambda functions connect to MongoDB Atlas using credentials retrieved from AWS Secrets Manager:

- Secret ID: `vehical-wellness-center-dev`
- Region: `us-west-2`
- Required fields: `MONGODB_ATLAS_HOST`, `MONGODB_ATLAS_USERNAME`, `MONGODB_ATLAS_PASSWORD`

## Testing & Utilities

### MongoDB Connection Test

The `test-connection.ts` script validates MongoDB connectivity:

```powershell
# From project root
npm run test:connection
```

This verifies:

- AWS Secrets Manager access
- MongoDB Atlas connectivity
- Database and collection visibility

### Test Data Seeding

The `seed-test-data.ts` script creates a sample vehicle and events for API testing:

```powershell
# From project root
npm run seed:test
```

This script:

- Removes any existing test data (VIN: 1HGBH41JXMN109186)
- Inserts a sample 2021 Honda Accord with 5 maintenance events
- Displays the test API URL
- Auto-cleans up after 3 seconds

Use this for quick end-to-end validation of deployed Lambda functions.

## Dependencies

- **mongodb** – Official MongoDB Node.js driver
- **@aws-sdk/client-secrets-manager** – AWS Secrets Manager client
- **typescript** – TypeScript compiler
- **vitest** – Unit testing framework
- **eslint** – Code linting with TypeScript support
