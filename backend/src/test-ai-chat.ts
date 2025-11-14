/**
 * Test AI Chat Endpoint
 * 
 * Usage: 
 * AWS_PROFILE=terraform-vwc AWS_REGION=us-west-2 AWS_SECRET_ID=vehical-wellness-center-dev ts-node src/test-ai-chat.ts
 */

import { getAuth0Token } from "./lib/auth0";

const API_URL = "https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com";
const TEST_VEHICLE_ID = "507f1f77bcf86cd799439011"; // From seed data

async function testAIChat() {
  console.log("🤖 Testing AI Chat Endpoint\n");

  // Get Auth0 token
  console.log("Fetching Auth0 token...");
  const token = await getAuth0Token();
  console.log("✅ Token retrieved\n");

  // Test 1: Simple query about vehicle
  console.log("Test 1: Ask about vehicle overview");
  const response1 = await fetch(`${API_URL}/ai/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Tell me about this vehicle",
      vehicleId: TEST_VEHICLE_ID
    })
  });

  if (!response1.ok) {
    const errorText = await response1.text();
    throw new Error(`API call failed (${response1.status}): ${errorText}`);
  }

  const data1 = await response1.json() as { message: string; toolsUsed?: string[] };
  console.log("AI Response:", data1.message);
  console.log("Tools Used:", data1.toolsUsed);
  console.log();

  // Test 2: Add an event
  console.log("Test 2: Add oil change event");
  const response2 = await fetch(`${API_URL}/ai/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Add an oil change from yesterday for $45",
      vehicleId: TEST_VEHICLE_ID
    })
  });

  if (!response2.ok) {
    const errorText = await response2.text();
    throw new Error(`API call failed (${response2.status}): ${errorText}`);
  }

  const data2 = await response2.json() as { message: string; toolsUsed?: string[] };
  console.log("AI Response:", data2.message);
  console.log("Tools Used:", data2.toolsUsed);
  console.log();

  console.log("✅ All tests passed!");
}

testAIChat()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
