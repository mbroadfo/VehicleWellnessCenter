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
npm run test:connection    # Test MongoDB Atlas connection via Parameter Store
npm run seed:test          # Seed test data for API validation (auto-cleans after 3s)
```

### Lint & Type Check

```powershell
npm run lint:backend       # Lint with ESLint
npm run typecheck:backend  # Type check with TypeScript compiler
```

## Lambda Architecture

**Single unified Lambda** (`vwc-dev`) with router pattern dispatches requests to route handlers based on HTTP method and path. All routes share the same Lambda container, connection pool, and token cache for optimal performance.

### Lambda Entry Point

- **index.ts** (`src/index.ts`) – Main router with regex-based request dispatching
  - Handles 4 routes through a single Lambda function
  - Centralized error handling (404 for unknown routes, 500 for crashes)
  - Uses APIGatewayProxyEventV2 for all routes

### API Routes

All API endpoints are protected with Auth0 JWT authentication - valid tokens required in `Authorization: Bearer <token>` header.

- **GET /vehicles/{vehicleId}/overview** (`src/routes/getVehicleOverview.ts`)
  - Returns: Vehicle details + last 5 events
  - Validates ObjectId format, handles 400/404/500 errors

- **GET /vehicles/{vehicleId}/events** (`src/routes/listVehicleEvents.ts`)
  - Query params: `limit` (1-100, default 10), `offset` (default 0), `type` (optional filter)
  - Returns: Paginated events sorted by date (newest first)
  - Includes pagination metadata: totalCount, hasMore, nextOffset

- **POST /vehicles/{vehicleId}/events** (`src/routes/recordVehicleEvent.ts`)
  - Creates new maintenance/incident records
  - Comprehensive validation (required fields, date format, cost range, ObjectId)
  - Returns 201 with eventId on success

- **POST /ai/chat** (`src/routes/aiChat.ts`)
  - AI Data Curator with Gemini 2.5 Flash model
  - Function calling: AI calls existing CRUD endpoints via HTTP
  - Natural language interface for vehicle data queries and updates

## MongoDB Connection

All Lambda functions connect to MongoDB Atlas using credentials retrieved from AWS Systems Manager Parameter Store:

- Parameter: `/vwc/dev/secrets` (SecureString)
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

- AWS Parameter Store access
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
- **@aws-sdk/client-ssm** – AWS Systems Manager (Parameter Store) client
- **@google/generative-ai** – Google Gemini AI SDK
- **typescript** – TypeScript compiler
- **vitest** – Unit testing framework
- **eslint** – Code linting with TypeScript support
