#!/usr/bin/env tsx
/**
 * Generate VIN-based report for a specific vehicle
 */

import { getDatabase, closeConnection } from './lib/mongodb.js';
import { ObjectId } from 'mongodb';

const VEHICLE_ID = '691bb2c21e0a903ed93c5838';

interface VehicleDocument {
  _id: ObjectId;
  vin: string;
  nickname?: string;
  specs?: Record<string, string>;
  safety?: {
    recalls?: Array<{
      NHTSACampaignNumber?: string;
      Component?: string;
      Summary?: string;
      Consequence?: string;
      Remedy?: string;
      ReportReceivedDate?: string;
    }>;
    complaints?: Array<{
      ODINumber?: string;
      components?: string;
      summary?: string;
      crash?: string;
      fire?: string;
      injured?: string;
      dateOfIncident?: string;
    }>;
    recallsFetchedAt?: Date;
    complaintsFetchedAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

async function generateReport() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('                    VEHICLE WELLNESS CENTER REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const db = await getDatabase();
  const vehicle = await db.collection('vehicles').findOne({ 
    _id: new ObjectId(VEHICLE_ID) 
  }) as VehicleDocument | null;

  if (!vehicle) {
    console.log('❌ Vehicle not found!');
    return;
  }

  // Vehicle Info
  console.log('📋 VEHICLE INFORMATION');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log(`   VIN:        ${vehicle.vin}`);
  console.log(`   Nickname:   ${vehicle.nickname || 'N/A'}`);
  console.log(`   Vehicle ID: ${vehicle._id}`);
  console.log();

  // Specifications
  if (vehicle.specs) {
    const specs = vehicle.specs as any;
    console.log('🔧 VEHICLE SPECIFICATIONS');
    console.log('─────────────────────────────────────────────────────────────────────────────');
    console.log(`   Body Style:     ${specs.body?.type || 'N/A'}`);
    console.log(`   Doors:          ${specs.body?.doors || 'N/A'}`);
    console.log(`   Engine:         ${specs.engine?.manufacturer || 'N/A'}`);
    console.log(`   Cylinders:      ${specs.engine?.cylinders || 'N/A'}`);
    console.log(`   Displacement:   ${specs.engine?.displacement || 'N/A'}L`);
    console.log(`   Horsepower:     ${specs.engine?.horsepower || 'N/A'}`);
    console.log(`   Fuel Type:      ${specs.engine?.fuelType || 'N/A'}`);
    console.log(`   Transmission:   ${specs.transmission || 'N/A'}`);
    console.log(`   GVWR:           ${specs.weights?.gvwr || 'N/A'}`);
    console.log(`   Data Source:    ${specs.source || 'N/A'}`);
    console.log(`   Decoded At:     ${specs.decodedAt ? new Date(specs.decodedAt).toLocaleString() : 'N/A'}`);
    console.log();
  }

  // Safety Data
  if (vehicle.safety) {
    const { recalls, complaints, recallsFetchedAt, complaintsFetchedAt } = vehicle.safety;

    // Recalls
    console.log('⚠️  SAFETY RECALLS');
    console.log('─────────────────────────────────────────────────────────────────────────────');
    if (recalls && recalls.length > 0) {
      console.log(`   📊 Total Recalls: ${recalls.length}`);
      console.log(`   🕐 Last Updated: ${recallsFetchedAt ? new Date(recallsFetchedAt).toLocaleString() : 'Never'}`);
      console.log();

      recalls.forEach((recall, idx) => {
        const r = recall as any;
        console.log(`   ${idx + 1}. Campaign: ${r.NHTSACampaignNumber || 'Unknown'}`);
        console.log(`      Component:  ${r.component || 'N/A'}`);
        console.log(`      Date:       ${r.reportReceivedDate || 'N/A'}`);
        console.log(`      Summary:    ${r.summary?.substring(0, 200) || 'N/A'}...`);
        console.log(`      Remedy:     ${r.remedy?.substring(0, 150) || 'N/A'}...`);
        console.log();
      });
    } else {
      console.log('   ✅ No recalls found for this vehicle');
      console.log();
    }

    // Complaints
    console.log('📝 CONSUMER COMPLAINTS');
    console.log('─────────────────────────────────────────────────────────────────────────────');
    if (complaints && complaints.length > 0) {
      console.log(`   📊 Total Complaints: ${complaints.length}`);
      console.log(`   🕐 Last Updated: ${complaintsFetchedAt ? new Date(complaintsFetchedAt).toLocaleString() : 'Never'}`);
      console.log();

      // Show top 10 complaints
      const topComplaints = complaints.slice(0, 10);
      console.log(`   Showing ${topComplaints.length} of ${complaints.length} complaints:\n`);

      topComplaints.forEach((complaint, idx) => {
        const crashIcon = String(complaint.crash || '').toLowerCase() === 'yes' ? '💥' : '';
        const fireIcon = String(complaint.fire || '').toLowerCase() === 'yes' ? '🔥' : '';
        const injuredIcon = complaint.injured ? '🤕' : '';
        const flags = [crashIcon, fireIcon, injuredIcon].filter(f => f).join(' ');

        console.log(`   ${idx + 1}. ODI: ${complaint.ODINumber || 'Unknown'} ${flags}`);
        console.log(`      Component:  ${complaint.components || 'N/A'}`);
        console.log(`      Date:       ${complaint.dateOfIncident || 'N/A'}`);
        console.log(`      Summary:    ${complaint.summary?.substring(0, 200) || 'N/A'}...`);
        console.log();
      });

      if (complaints.length > 10) {
        console.log(`   ... and ${complaints.length - 10} more complaints`);
        console.log();
      }
    } else {
      console.log('   ✅ No complaints found for this vehicle');
      console.log();
    }
  }

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                         END OF REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    await generateReport();
  } catch (error) {
    console.error('❌ Error generating report:', error);
    process.exit(1);
  } finally {
    await closeConnection();
    process.exit(0);
  }
}

void main();
