# Infrastructure

This directory contains Terraform configuration for the Vehicle Wellness Center platform. Modules will provision MongoDB Atlas resources, AWS Lambda functions, API Gateway, S3 hosting (including asset and image storage), and supporting services such as Secrets Manager.

## Notes

- MongoDB Atlas application credentials are read at deploy time from AWS Secrets Manager; provide the secret ARN/ID via `TF_VAR_mongodb_database_user_secret_id` (or workspace variable) to avoid committing secrets.
- `collection-samples.json` mirrors the collection validators and indexes used by Terraform so you can review or iterate before applying changes.
- Terraform renders `collections-init.js` from `collections-init.js.tftpl`, allowing you to initialize collections manually with `mongosh` if needed.
