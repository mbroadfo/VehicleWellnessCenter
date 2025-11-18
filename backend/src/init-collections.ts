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

    // Create conversation_sessions collection
    const conversationSessionsCollection = {
      name: "conversation_sessions",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "createdAt", "lastActiveAt"],
          properties: {
            userId: { bsonType: "string", description: "Auth0 user identifier" },
            vehicleId: { bsonType: ["objectId", "null"], description: "Optional vehicle context" },
            createdAt: { bsonType: "date", description: "Session creation timestamp" },
            lastActiveAt: { bsonType: "date", description: "Last message timestamp (for TTL)" },
            messageCount: { bsonType: "int", description: "Total messages in session" },
            title: { bsonType: ["string", "null"], description: "Generated from first message" }
          }
        }
      },
      validationAction: "warn"
    };

    if (!collectionNames.includes("conversation_sessions")) {
      console.log("Creating collection: conversation_sessions");
      await db.createCollection("conversation_sessions", { 
        validator: conversationSessionsCollection.validator, 
        validationAction: conversationSessionsCollection.validationAction 
      });
      
      // Create TTL index (auto-delete inactive sessions after 90 days)
      console.log("Creating TTL index: ttl_inactive_sessions (90 days)");
      await db.collection("conversation_sessions").createIndex(
        { lastActiveAt: 1 }, 
        { name: "ttl_inactive_sessions", expireAfterSeconds: 7776000 } // 90 days
      );
      
      // Create lookup index
      console.log("Creating index: ix_user_sessions");
      await db.collection("conversation_sessions").createIndex({ userId: 1, lastActiveAt: -1 }, { name: "ix_user_sessions" });
    } else {
      console.log("Collection already exists: conversation_sessions");
    }

    // Create conversation_messages collection
    const conversationMessagesCollection = {
      name: "conversation_messages",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["sessionId", "userId", "role", "content", "timestamp"],
          properties: {
            sessionId: { bsonType: "objectId", description: "Reference to conversation_sessions._id" },
            userId: { bsonType: "string", description: "Auth0 user identifier" },
            vehicleId: { bsonType: ["objectId", "null"], description: "Optional vehicle context" },
            role: { enum: ["user", "assistant"], description: "Message sender role" },
            content: { bsonType: "string", description: "Message text content" },
            toolsUsed: { 
              bsonType: ["array", "null"], 
              items: { bsonType: "string" },
              description: "Functions called by AI (if assistant role)"
            },
            timestamp: { bsonType: "date", description: "Message creation timestamp (for TTL)" }
          }
        }
      },
      validationAction: "warn"
    };

    if (!collectionNames.includes("conversation_messages")) {
      console.log("Creating collection: conversation_messages");
      await db.createCollection("conversation_messages", { 
        validator: conversationMessagesCollection.validator, 
        validationAction: conversationMessagesCollection.validationAction 
      });
      
      // Create TTL index (auto-delete messages after 30 days)
      console.log("Creating TTL index: ttl_message_expiry (30 days)");
      await db.collection("conversation_messages").createIndex(
        { timestamp: 1 }, 
        { name: "ttl_message_expiry", expireAfterSeconds: 2592000 } // 30 days
      );
      
      // Create session lookup index
      console.log("Creating index: ix_session_messages");
      await db.collection("conversation_messages").createIndex(
        { sessionId: 1, timestamp: 1 }, 
        { name: "ix_session_messages" }
      );
      
      // Create user lookup index
      console.log("Creating index: ix_user_messages");
      await db.collection("conversation_messages").createIndex(
        { userId: 1, timestamp: -1 }, 
        { name: "ix_user_messages" }
      );
    } else {
      console.log("Collection already exists: conversation_messages");
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
