#!/usr/bin/env tsx
import { getDatabase, closeConnection } from './lib/mongodb.js';
import { ObjectId } from 'mongodb';

async function main() {
  const db = await getDatabase();
  const vehicle = await db.collection('vehicles').findOne({ _id: new ObjectId('691bb2c21e0a903ed93c5838') }) as any;

  console.log('=== SPECS STRUCTURE ===');
  console.log(JSON.stringify(vehicle?.specs, null, 2));

  console.log('\n=== FIRST RECALL ===');
  console.log(JSON.stringify(vehicle?.safety?.recalls?.[0], null, 2));

  await closeConnection();
  process.exit(0);
}

void main();
