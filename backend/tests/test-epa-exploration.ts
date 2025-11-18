/**
 * EPA Fuel Economy API Exploration Script
 * 
 * Purpose: Research how to get fuel economy data for vehicles
 * Approach 1: Check if NHTSA vPIC includes EPA data
 * Approach 2: Use EPA API directly (requires vehicle ID lookup)
 */

import { getSecretsFromParameterStore } from '../src/lib/parameterStore.js';

const TEST_VIN = '1C4PJMBS9HW664582'; // 2017 Jeep Cherokee

async function testNHTSAForEPAData() {
  console.log('\n=== Testing NHTSA vPIC for EPA Data ===\n');
  
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${TEST_VIN}?format=json`;
  const response = await fetch(url);
  const data = await response.json();
  
  // Look for EPA-related fields
  const epaFields = data.Results.filter((r: any) => 
    r.Variable?.toLowerCase().includes('epa') ||
    r.Variable?.toLowerCase().includes('fuel') ||
    r.Variable?.toLowerCase().includes('mpg') ||
    r.Variable?.toLowerCase().includes('economy')
  );
  
  console.log('EPA/Fuel/Economy-related fields in NHTSA response:');
  epaFields.forEach((field: any) => {
    console.log(`  ${field.Variable}: ${field.Value || '(empty)'}`);
  });
  
  // Also show ALL available fields for reference
  console.log('\n=== All NHTSA Fields (first 50) ===');
  data.Results.slice(0, 50).forEach((field: any) => {
    if (field.Value) {
      console.log(`  ${field.Variable}: ${field.Value}`);
    }
  });
  
  return epaFields.length > 0;
}

async function testEPADirectAPI() {
  console.log('\n=== Testing EPA API Direct Lookup ===\n');
  
  // From NHTSA we know: 2017 Jeep Cherokee
  const year = 2017;
  const make = 'Jeep';
  const model = 'Cherokee';
  
  // Step 1: Get vehicle options
  console.log(`Looking up EPA vehicle options for ${year} ${make} ${model}...`);
  const optionsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${make}&model=${model}`;
  
  try {
    const optionsResponse = await fetch(optionsUrl);
    const optionsXML = await optionsResponse.text();
    console.log('EPA options response (XML):', optionsXML.substring(0, 500));
    
    // Try alternate endpoint - just get all vehicles for year/make
    console.log('\nTrying alternate: get all vehicles for year/make...');
    const vehiclesUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/vehicle?year=${year}&make=${make}`;
    const vehiclesResponse = await fetch(vehiclesUrl);
    const vehiclesXML = await vehiclesResponse.text();
    console.log('EPA vehicles response:', vehiclesXML.substring(0, 1000));
    
  } catch (error) {
    console.error('EPA API error:', error);
  }
}

async function main() {
  console.log('EPA Fuel Economy Data Exploration\n');
  console.log(`Test Vehicle: ${TEST_VIN} (2017 Jeep Cherokee)\n`);
  
  // Test NHTSA first
  const nthsaHasEPA = await testNHTSAForEPAData();
  
  if (nthsaHasEPA) {
    console.log('\n✅ NHTSA vPIC includes EPA data! We can use existing integration.\n');
  } else {
    console.log('\n❌ NHTSA vPIC does not include EPA data. Must use EPA API directly.\n');
    await testEPADirectAPI();
  }
  
  console.log('\n=== Exploration Complete ===\n');
}

void main().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
