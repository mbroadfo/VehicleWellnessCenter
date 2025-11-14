# MongoDB Atlas & Secrets Setup Checklist

## Prep MongoDB Atlas for Vehicle Wellness Center

- [ ] Create a new Atlas project dedicated to Vehicle Wellness Center (or reuse the Terraform target project ID if already provisioned).
- [ ] Enable a Serverless instance in the target region (e.g., `US_EAST_1`) and note the cluster name.
- [ ] Add IP access list entries for trusted environments (developer CIDR blocks, Lambda VPC ranges, VPN gateways).
- [ ] Create a database user with `readWrite` access to the Vehicle Wellness Center database; store its credentials locally until they are moved into Secrets Manager.
- [ ] Capture the Atlas project ID, organization ID, and connection SRV URI for later reference.

## Populate AWS Secrets Manager

- [ ] Create JSON secret `vehicle-wellness-center/mongodb/app-user` holding `{ "username": "...", "password": "..." }` for Terraform (matches `mongodb_database_user_secret_id`).
- [ ] Store programmatic Atlas API keys:
  - [ ] `MONGODB_ATLAS_PUBLIC_KEY`
  - [ ] `MONGODB_ATLAS_PRIVATE_KEY`
- [ ] Store Atlas identifiers and networking details:
  - [ ] `MONGODB_ATLAS_ORG_ID`
  - [ ] `MONGODB_ATLAS_PROJECT_ID`
  - [ ] `MONGODB_ATLAS_URI`
  - [ ] `DEVELOPMENT_CIDR_BLOCK`
  - [ ] `LAMBDA_CIDR_BLOCK`
- [ ] Provision and store AI provider credentials:
  - [ ] `OPENAI_API_KEY`
  - [ ] `GOOGLE_API_KEY`
  - [ ] `GROQ_API_KEY`
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `DEEPSEEK_API_KEY`
- [ ] Configure Auth0 application secrets:
  - [ ] `AUTH0_DOMAIN`
  - [ ] `AUTH0_M2M_CLIENT_ID`
  - [ ] `AUTH0_M2M_CLIENT_SECRET`
  - [ ] `AUTH0_MRB_CLIENT_ID`
  - [ ] `AUTH0_API_AUDIENCE`
  - [ ] `AUTH0_MANAGEMENT_AUDIENCE`
- [ ] Add integration URLs:
  - [ ] `LAMBDA_APP_URL`

## Finalize Integration

- [ ] Set `TF_VAR_mongodb_database_user_secret_id` to the ARN of `vehicle-wellness-center/mongodb/app-user` before running Terraform.
- [ ] Configure remaining application environments (Lambda, frontend, CI) to reference these secrets without committing any values to source control.
