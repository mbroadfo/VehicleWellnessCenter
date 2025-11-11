import { MongoClient } from "mongodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

interface VWCSecrets {
  MONGODB_ATLAS_HOST: string;
  MONGODB_ATLAS_USERNAME: string;
  MONGODB_ATLAS_PASSWORD: string;
}

async function getSecretsFromAWS(
  secretId: string
): Promise<VWCSecrets> {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("AWS_REGION environment variable is required");
  }
  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretId });

  try {
    const response = await client.send(command);
    const secretString = response.SecretString;
    if (!secretString || typeof secretString !== "string") {
      throw new Error("Secret value is empty or invalid");
    }
    return JSON.parse(secretString) as VWCSecrets;
  } catch (error) {
    console.error("Failed to retrieve secrets from AWS Secrets Manager:");
    throw error;
  }
}

async function testConnection(): Promise<void> {
  // Get secret ID from environment
  const secretId = process.env.AWS_SECRET_ID;
  if (!secretId) {
    throw new Error("AWS_SECRET_ID environment variable is required");
  }
  
  console.log(`Retrieving secrets from AWS Secrets Manager: ${secretId}`);
  const secrets = await getSecretsFromAWS(secretId);

  const username = secrets.MONGODB_ATLAS_USERNAME;
  const password = secrets.MONGODB_ATLAS_PASSWORD;
  const host = secrets.MONGODB_ATLAS_HOST;
  const appName = "vehicalwellnesscenter-cluster";

  const uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/?appName=${appName}`;

  console.log("Testing MongoDB Atlas connection...");
  console.log(`Host: ${host}`);
  console.log(`Username: ${username}`);

  const client = new MongoClient(uri);

  try {
    // Connect to the cluster
    await client.connect();
    console.log("✅ Successfully connected to MongoDB Atlas!");

    // Test database access
    const admin = client.db().admin();
    const serverInfo = await admin.serverInfo();
    console.log(`Server version: ${serverInfo.version}`);

    // List databases
    const databases = await admin.listDatabases();
    console.log("\nAvailable databases:");
    databases.databases.forEach((db: { name: string; sizeOnDisk?: number }) => {
      const size = db.sizeOnDisk ?? 0;
      console.log(`  - ${db.name} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    });

    // Test vehicle_wellness_center database
    const vwcDb = client.db("vehicle_wellness_center");
    const collections = await vwcDb.listCollections().toArray();
    console.log("\nCollections in vehicle_wellness_center:");
    if (collections.length === 0) {
      console.log("  (no collections yet)");
    } else {
      collections.forEach((col: { name: string }) => {
        console.log(`  - ${col.name}`);
      });
    }

    console.log("\n✅ Connection test completed successfully!");
  } catch (error) {
    console.error("❌ Connection failed:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await client.close();
    console.log("\nConnection closed.");
  }
}

void testConnection();
