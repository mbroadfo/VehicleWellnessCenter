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
```

### Lint & Type Check

```powershell
npm run lint:backend       # Lint with ESLint
npm run typecheck:backend  # Type check with TypeScript compiler
```

## Lambda Functions

Lambda functions use IAM role-based authentication and retrieve MongoDB credentials from AWS Secrets Manager at runtime.

### Planned Functions

- **getVehicleOverview** – Retrieve vehicle details and summary statistics
- **listVehicleEvents** – Query vehicle events with filtering and pagination
- **recordVehicleEvent** – Create new maintenance/incident records
- **chatVehicleHistory** – AI-powered conversational vehicle insights

## MongoDB Connection

All Lambda functions connect to MongoDB Atlas using credentials retrieved from AWS Secrets Manager:

- Secret ID: `vehical-wellness-center-dev`
- Region: `us-west-2`
- Required fields: `MONGODB_ATLAS_HOST`, `MONGODB_ATLAS_USERNAME`, `MONGODB_ATLAS_PASSWORD`

## Testing

The `test-connection.ts` script validates MongoDB connectivity:

```powershell
# From project root
. .\load-aws-credentials.ps1
npm run test:connection
```

This verifies:

- AWS Secrets Manager access
- MongoDB Atlas connectivity
- Database and collection visibility

## Dependencies

- **mongodb** – Official MongoDB Node.js driver
- **@aws-sdk/client-secrets-manager** – AWS Secrets Manager client
- **typescript** – TypeScript compiler
- **vitest** – Unit testing framework
- **eslint** – Code linting with TypeScript support
