# Vehicle Wellness Center

Full-stack platform for tracking vehicle maintenance, incidents, and upgrades. The solution leverages MongoDB Atlas for storage, AWS Lambda for business logic, API Gateway with JWT authorizers for secure APIs, and a React SPA hosted on Amazon S3. Vehicle imagery and document artifacts are persisted in an S3 bucket alongside the SPA assets. Infrastructure is provisioned via Terraform. Development workflows rely on npm tooling.

## Project Structure

- `infra/` – Terraform IaC for MongoDB Atlas, AWS Lambda, API Gateway, S3 hosting, and Parameter Store integration.
- `backend/` – Node.js Lambda handlers orchestrating vehicle event management and integrations.
- `frontend/` – React SPA (Vite + TypeScript) featuring chat-driven insights and a vehicle history timeline.
- `docs/` – Technical documentation for data models, MongoDB Atlas setup, and secrets management.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Terraform** >= 1.6.0
- **AWS CLI** configured with `terraform-vwc` profile
- **MongoDB Atlas** account and project

## Getting Started

### 1. Install Dependencies

This project uses npm workspaces. Install all dependencies from the root:

```powershell
npm install
```

### 2. Configure AWS Credentials

Set up your AWS profile and environment variables:

```powershell
# Load AWS credentials for Terraform operations
. .\load-aws-credentials.ps1
```

This sets:

- `AWS_PROFILE=terraform-vwc`
- `AWS_REGION=us-west-2`
- `SSM_SECRETS_PARAMETER_NAME=/vwc/dev/secrets`

### 3. Populate AWS Systems Manager Parameter Store

Create a SecureString parameter at `/vwc/dev/secrets` in AWS Systems Manager Parameter Store (us-west-2) with the structure from `infra/parameter-example.json`. See `docs/parameter-store-setup.md` for details.

### 4. Test MongoDB Connection

Verify connectivity to MongoDB Atlas via Parameter Store:

```powershell
npm run test:connection
```

### 5. Provision Infrastructure

Initialize and apply Terraform configuration:

```powershell
cd infra
terraform init
terraform plan
terraform apply
```

## Development Commands

Run all commands from the project root:

### Build

```powershell
npm run build              # Build all workspaces
npm run build:backend      # Build backend only
npm run build:frontend     # Build frontend only
```

### Test

```powershell
npm run test               # Run all tests
npm run test:backend       # Run backend tests
npm run test:backend:watch # Run backend tests in watch mode
npm run test:connection    # Test MongoDB Atlas connection
```

### Lint & Type Check

```powershell
npm run lint               # Lint all workspaces
npm run lint:backend       # Lint backend only
npm run lint:frontend      # Lint frontend only
npm run typecheck          # Type check all workspaces
npm run typecheck:backend  # Type check backend only
```

### Frontend Development

```powershell
npm run dev:frontend       # Start Vite dev server
```

### Clean

```powershell
npm run clean              # Clean build artifacts in all workspaces
npm run clean:all          # Clean all node_modules
```

## Documentation

- **`PLAN.md`** – Implementation roadmap with milestones
- **`docs/data-model.md`** – MongoDB schema and collection design
- **`docs/dealer-import-guide.md`** – Importing dealer maintenance records (Mopar, Honda)
- **`docs/MongoDB-Atlas-Setup-Guide.md`** – Atlas project and cluster setup
- **`docs/parameter-store-setup.md`** – Parameter Store secrets provisioning
- **`backend/README.md`** – Backend Lambda function details
- **`frontend/README.md`** – React SPA development guide
- **`infra/README.md`** – Terraform resource documentation

## Architecture

**Cloud Native Stack:**

- **MongoDB Atlas** – Serverless instance in us-west-2 (AWS-backed)
- **AWS Lambda** – Node.js runtime with IAM role-based permissions
- **AWS Systems Manager Parameter Store** – Centralized credential storage (FREE)
- **API Gateway** – RESTful API with JWT authorization
- **S3** – Static SPA hosting and vehicle media storage
- **Terraform** – Infrastructure as Code

**Security:**

- No hardcoded credentials
- IAM roles for Lambda execution (no access keys in production)
- Parameter Store SecureString integration for application secrets (MongoDB, Auth0, Gemini)
- JWT-based API authentication

## License

UNLICENSED – Private project
