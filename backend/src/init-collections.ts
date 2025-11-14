import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { join } from "path";
import { getSecretsFromParameterStore } from "./lib/parameterStore.js";

async function initializeCollections(): Promise<void> {
  console.log("Retrieving secrets from Parameter Store...");
  const secrets = await getSecretsFromParameterStore();

  const username = secrets.MONGODB_ATLAS_USERNAME;
  const password = secrets.MONGODB_ATLAS_PASSWORD;
  const host = secrets.MONGODB_ATLAS_HOST;
  const appName = "vehicalwellnesscenter-cluster";

  const uri = `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/?appName=${appName}`;

  console.log("Connecting to MongoDB Atlas...");
  console.log(`Host: ${host}`);

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Successfully connected to MongoDB Atlas!");

    // Read and execute the initialization script
    const scriptPath = join(__dirname, "../../infra/collections-init.js");
    const scriptContent = readFileSync(scriptPath, "utf-8");

    console.log("\nInitializing collections from script...");
    
    // Execute the script using eval in the context of the connected database
    const db = client.db("vehicle_wellness_center");
    
    // Parse and execute the initialization logic
    // Since we can't directly eval the mongosh script, we'll implement the logic here
    const vehiclesCollection = {
      name: "vehicles",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["vin", "name", "acquiredAt"],
          properties: {
            vin: { bsonType: "string", description: "Vehicle identification number", minLength: 11 },
            name: { bsonType: "string", description: "Human-friendly vehicle name" },
            acquiredAt: { bsonType: "date", description: "Acquisition timestamp" }
          }
        }
      },
      validationAction: "warn"
    };

    const fleetsCollection = {
      name: "fleets",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "ownerId"],
          properties: {
            name: { bsonType: "string", description: "Fleet name" },
            ownerId: { bsonType: "string", description: "Fleet owner identifier" },
            description: { bsonType: ["string", "null"] },
            vehicleIds: { 
              bsonType: ["array", "null"], 
              items: { bsonType: "objectId" },
              description: "Array of vehicle._id references"
            }
          }
        }
      },
      validationAction: "warn"
    };

    const vehicleEventsCollection = {
      name: "vehicleEvents",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["vehicleId", "occurredAt", "type", "summary"],
          properties: {
            vehicleId: { bsonType: "objectId", description: "Reference to vehicles._id" },
            occurredAt: { bsonType: "date", description: "When the event happened" },
            type: { bsonType: "string", description: "Event taxonomy identifier" },
            summary: { bsonType: "string", description: "Timeline headline" }
          }
        }
      },
      validationAction: "warn"
    };

    // Create vehicles collection
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c: { name: string }) => c.name);

    if (!collectionNames.includes("vehicles")) {
      console.log("Creating collection: vehicles");
      await db.createCollection("vehicles", { validator: vehiclesCollection.validator, validationAction: vehiclesCollection.validationAction });
      
      // Create indexes
      console.log("Creating index: uk_vehicle_vin (unique)");
      await db.collection("vehicles").createIndex({ vin: 1 }, { name: "uk_vehicle_vin", unique: true });
      
      console.log("Creating index: ix_vehicle_owner_vin");
      await db.collection("vehicles").createIndex({ ownerId: 1, vin: 1 }, { name: "ix_vehicle_owner_vin" });
    } else {
      console.log("Collection already exists: vehicles");
    }

    // Create fleets collection
    if (!collectionNames.includes("fleets")) {
      console.log("Creating collection: fleets");
      await db.createCollection("fleets", { validator: fleetsCollection.validator, validationAction: fleetsCollection.validationAction });
      
      // Create indexes
      console.log("Creating index: ix_fleet_owner_name");
      await db.collection("fleets").createIndex({ ownerId: 1, name: 1 }, { name: "ix_fleet_owner_name" });
    } else {
      console.log("Collection already exists: fleets");
    }

    // Create vehicleEvents collection
    if (!collectionNames.includes("vehicleEvents")) {
      console.log("Creating collection: vehicleEvents");
      await db.createCollection("vehicleEvents", { validator: vehicleEventsCollection.validator, validationAction: vehicleEventsCollection.validationAction });
      
      // Create indexes
      console.log("Creating index: ix_vehicle_timeline");
      await db.collection("vehicleEvents").createIndex({ occurredAt: -1, vehicleId: 1 }, { name: "ix_vehicle_timeline" });
      
      console.log("Creating index: ix_event_type_time");
      await db.collection("vehicleEvents").createIndex({ occurredAt: -1, type: 1 }, { name: "ix_event_type_time" });
    } else {
      console.log("Collection already exists: vehicleEvents");
    }

    console.log("\n✅ Collection initialization completed successfully!");

    // Verify collections were created
    const finalCollections = await db.listCollections().toArray();
    console.log("\nCollections in vehicle_wellness_center:");
    finalCollections.forEach((col: { name: string }) => {
      console.log(`  - ${col.name}`);
    });

  } catch (error) {
    console.error("❌ Initialization failed:");
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

void initializeCollections();
