import { MongoClient } from "mongodb";
import { getSecretsFromParameterStore } from "../src/lib/parameterStore";

async function testConnection(): Promise<void> {
  console.log("Retrieving secrets from Parameter Store...");
  const secrets = await getSecretsFromParameterStore();

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

    // Check vehicle with VIN 1C4PJMBS9HW664582
    const vehiclesCollection = vwcDb.collection("vehicles");
    const vehicle = await vehiclesCollection.findOne({
      "identification.vin": "1C4PJMBS9HW664582",
    });
    if (vehicle) {
      console.log("\n🚗 Found vehicle with VIN 1C4PJMBS9HW664582:");
      console.log(`  _id: ${vehicle._id}`);
      console.log(`  ownership.ownerId: ${vehicle.ownership?.ownerId || "NOT SET"}`);
      console.log(`  nickname: ${vehicle.nickname || "none"}`);
      console.log(`  year/make/model: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    } else {
      console.log("\n⚠️ No vehicle found with VIN 1C4PJMBS9HW664582");
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
