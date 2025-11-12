import { MongoClient, Db } from "mongodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

interface MongoDBCredentials {
  MONGODB_ATLAS_HOST: string;
  MONGODB_ATLAS_USERNAME: string;
  MONGODB_ATLAS_PASSWORD: string;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Get MongoDB credentials from AWS Secrets Manager
 */
async function getCredentials(): Promise<MongoDBCredentials> {
  // AWS_REGION is automatically set by Lambda runtime
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2";
  const secretId =
    process.env.AWS_SECRET_ID || "vehical-wellness-center-dev";

  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error("Secret value is empty");
  }

  const credentials = JSON.parse(response.SecretString) as MongoDBCredentials;

  if (
    !credentials.MONGODB_ATLAS_HOST ||
    !credentials.MONGODB_ATLAS_USERNAME ||
    !credentials.MONGODB_ATLAS_PASSWORD
  ) {
    throw new Error("Missing required MongoDB credentials in secret");
  }

  return credentials;
}

/**
 * Get MongoDB database connection (with connection pooling/caching for Lambda)
 */
export async function getDatabase(): Promise<Db> {
  // Reuse cached connection if available (Lambda container reuse)
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  const credentials = await getCredentials();
  const { MONGODB_ATLAS_HOST, MONGODB_ATLAS_USERNAME, MONGODB_ATLAS_PASSWORD } =
    credentials;

  const uri = `mongodb+srv://${encodeURIComponent(MONGODB_ATLAS_USERNAME)}:${encodeURIComponent(MONGODB_ATLAS_PASSWORD)}@${MONGODB_ATLAS_HOST}/?retryWrites=true&w=majority&appName=VehicleWellnessCenter`;

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();

  const dbName = process.env.MONGODB_DATABASE || "vehicle_wellness_center";
  const db = client.db(dbName);

  // Cache for subsequent invocations
  cachedClient = client;
  cachedDb = db;

  return db;
}

/**
 * Close MongoDB connection (use sparingly in Lambda; prefer connection reuse)
 */
export async function closeConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
