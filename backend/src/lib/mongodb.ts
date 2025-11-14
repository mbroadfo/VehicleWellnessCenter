import { MongoClient, Db } from "mongodb";
import { getSecretsFromParameterStore, type AppSecrets } from './parameterStore';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Get all application secrets from Parameter Store
 */
export async function getSecrets(): Promise<AppSecrets> {
  return await getSecretsFromParameterStore();
}

/**
 * Get MongoDB database connection (with connection pooling/caching for Lambda)
 */
export async function getDatabase(): Promise<Db> {
  // Reuse cached connection if available (Lambda container reuse)
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  const secrets = await getSecrets();
  const { MONGODB_ATLAS_HOST, MONGODB_ATLAS_USERNAME, MONGODB_ATLAS_PASSWORD } =
    secrets;

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
