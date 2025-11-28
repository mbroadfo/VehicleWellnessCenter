/**
 * Migration script to update vehicle schema from flat `vin` to nested `identification.vin`
 * 
 * Run with: npm run migrate:vehicle-schema --workspace=backend
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { ObjectId } from 'mongodb';
import { getDatabase } from './lib/mongodb';

async function migrateVehicleSchema() {
  console.log('🔄 Starting vehicle schema migration...\n');
  
  const db = await getDatabase();
  const vehicles = db.collection('vehicles');
  
  // 1. Drop old unique index on `vin`
  console.log('📋 Dropping old unique index on `vin`...');
  try {
    await vehicles.dropIndex('uk_vehicle_vin');
    console.log('✅ Dropped old index: uk_vehicle_vin\n');
  } catch {
    console.log('ℹ️  Index uk_vehicle_vin does not exist (already migrated?)\n');
  }
  
  // 2. Migrate existing documents (if any) from flat `vin` to `identification.vin`
  console.log('📋 Migrating existing vehicle documents...');
  const cursor = vehicles.find({ vin: { $exists: true } });
  let migratedCount = 0;
  
  for await (const vehicle of cursor) {
    await vehicles.updateOne(
      { _id: vehicle._id },
      {
        $set: {
          'identification.vin': (vehicle as any).vin,
          updatedAt: new Date(),
        },
        $unset: {
          vin: '',
        },
      }
    );
    migratedCount++;
    console.log(`  ✅ Migrated vehicle ${vehicle._id.toString()}: ${(vehicle as any).vin}`);
  }
  
  console.log(`\n✅ Migration complete! Migrated ${migratedCount} vehicle(s).\n`);
  
  // 3. Remove duplicate VINs (keep only the first occurrence)
  console.log('📋 Removing duplicate VINs...');
  const allVehicles = await vehicles.find({}).toArray();
  const vinSeen = new Map<string, string>();
  const duplicateIds: ObjectId[] = [];

  for (const vehicle of allVehicles as any[]) {
    const vin = vehicle.identification?.vin as string;
    if (vin) {
      if (vinSeen.has(vin)) {
        // This is a duplicate - mark for deletion
        duplicateIds.push(vehicle._id as ObjectId);
        console.log(`  ❌ Found duplicate: ${vehicle._id.toString()} (VIN: ${vin})`);
      } else {
        // First occurrence - keep it
        vinSeen.set(vin, vehicle._id.toString());
        console.log(`  ✅ Keeping: ${vehicle._id.toString()} (VIN: ${vin})`);
      }
    }
  }

  if (duplicateIds.length > 0) {
    const deleteResult = await vehicles.deleteMany({
      _id: { $in: duplicateIds },
    });
    console.log(`\n✅ Deleted ${deleteResult.deletedCount} duplicate vehicle(s).\n`);
  } else {
    console.log('\n✅ No duplicates found.\n');
  }
  
  // 4. Create new unique index on `identification.vin`
  console.log('📋 Creating new unique index on `identification.vin`...');
  await vehicles.createIndex(
    { 'identification.vin': 1 },
    { name: 'uk_vehicle_identification_vin', unique: true }
  );
  console.log('✅ Created new index: uk_vehicle_identification_vin\n');
  
  // 4. Show final index list
  console.log('📋 Final indexes:');
  const indexes = await vehicles.indexes();
  for (const index of indexes) {
    console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
  }
  
  process.exit(0);
}

migrateVehicleSchema().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
