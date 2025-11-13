/**
 * Seed test data for API testing
 * Inserts a sample vehicle and events into MongoDB
 */

import { ObjectId } from 'mongodb';
import { getDatabase } from './lib/mongodb';

async function seedTestData() {
  console.log('Connecting to MongoDB...');
  const db = await getDatabase();

  // Clean up any existing test data first
  const testVin = '1HGBH41JXMN109186';
  console.log('Cleaning up existing test data...');
  const existingVehicle = await db.collection('vehicles').findOne({ vin: testVin });
  if (existingVehicle) {
    await db.collection('vehicleEvents').deleteMany({ vehicleId: existingVehicle._id });
    await db.collection('vehicles').deleteOne({ _id: existingVehicle._id });
    console.log('✅ Cleaned up existing test data\n');
  }

  // Sample vehicle
  const vehicleId = new ObjectId();
  const vehicle = {
    _id: vehicleId,
    vin: '1HGBH41JXMN109186',
    year: 2021,
    make: 'Honda',
    model: 'Accord',
    trim: 'Sport',
    color: 'Modern Steel Metallic',
    licensePlate: 'ABC123',
    ownerId: 'user_001',
    nickname: 'My Accord',
    currentMileage: 45230,
    purchaseDate: new Date('2021-03-15'),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Sample events
  const events = [
    {
      _id: new ObjectId(),
      vehicleId,
      type: 'oil_change',
      occurredAt: new Date('2024-01-15'),
      mileage: 35000,
      description: 'Regular oil change and filter replacement',
      provider: 'Honda of Boulder',
      cost: 65.00,
      metadata: {
        serviceAdvisor: 'John Smith',
        oilType: '0W-20 Synthetic',
        filterType: 'OEM'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new ObjectId(),
      vehicleId,
      type: 'tire_rotation',
      occurredAt: new Date('2024-03-20'),
      mileage: 38500,
      description: 'Tire rotation and pressure check',
      provider: 'Discount Tire',
      cost: 0.00,
      metadata: {
        frontPressure: 35,
        rearPressure: 33
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new ObjectId(),
      vehicleId,
      type: 'inspection',
      occurredAt: new Date('2024-06-10'),
      mileage: 41000,
      description: 'Annual state safety inspection',
      provider: 'Honda of Boulder',
      cost: 25.00,
      metadata: {
        passed: true,
        expiresAt: new Date('2025-06-10')
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new ObjectId(),
      vehicleId,
      type: 'brake_service',
      occurredAt: new Date('2024-08-05'),
      mileage: 43200,
      description: 'Front brake pad replacement',
      provider: 'Honda of Boulder',
      cost: 285.00,
      metadata: {
        serviceAdvisor: 'Sarah Johnson',
        parts: ['Front brake pads', 'Hardware kit'],
        warranty: '12 months / 12,000 miles'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new ObjectId(),
      vehicleId,
      type: 'oil_change',
      occurredAt: new Date('2024-10-20'),
      mileage: 45000,
      description: 'Regular oil change and multi-point inspection',
      provider: 'Honda of Boulder',
      cost: 68.00,
      metadata: {
        serviceAdvisor: 'John Smith',
        oilType: '0W-20 Synthetic',
        filterType: 'OEM',
        nextServiceDue: 50000
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  console.log('Upserting vehicle...');
  const vehicleResult = await db.collection('vehicles').updateOne(
    { _id: vehicle._id },
    { $set: vehicle },
    { upsert: true }
  );
  console.log(`✅ Vehicle ${vehicleResult.upsertedId ? 'inserted' : 'updated'}: ${vehicle._id.toString()}`);

  console.log('Upserting events...');
  let insertedCount = 0;
  let updatedCount = 0;
  for (const event of events) {
    const result = await db.collection('vehicleEvents').updateOne(
      { _id: event._id },
      { $set: event },
      { upsert: true }
    );
    if (result.upsertedId) insertedCount++;
    else updatedCount++;
  }
  console.log(`✅ Events: ${insertedCount} inserted, ${updatedCount} updated`);

  console.log('\n📊 Test Data Summary:');
  console.log(`Vehicle ID: ${vehicle._id.toString()}`);
  console.log(`VIN: ${vehicle.vin}`);
  console.log(`Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`);
  console.log(`Events: ${events.length} maintenance records`);
  console.log(`\n🔗 Test URLs:`);
  console.log(`Overview: https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com/vehicles/${vehicle._id.toString()}/overview`);
  console.log(`Events: https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com/vehicles/${vehicle._id.toString()}/events`);
  console.log(`\n✅ Test data created successfully! (Not auto-cleaned)`);
  process.exit(0);

  // Auto-cleanup disabled - uncomment below to enable
  /*
  console.log('\n⏳ Waiting 3 seconds before cleanup...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('🧹 Cleaning up test data...');
  try {
    const deleteEventsResult = await db.collection('vehicleEvents').deleteMany({ vehicleId });
    console.log(`  ✅ Deleted ${deleteEventsResult.deletedCount} events`);
    
    const deleteVehicleResult = await db.collection('vehicles').deleteOne({ _id: vehicle._id });
    console.log(`  ✅ Deleted ${deleteVehicleResult.deletedCount} vehicle`);
    
    console.log('✅ Cleanup complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
  */
}

seedTestData().catch((error) => {
  console.error('❌ Error seeding test data:', error);
  process.exit(1);
});
