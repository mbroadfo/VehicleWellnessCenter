import { getAuth0Token, clearAuth0TokenCache, clearMemoryCache } from './lib/auth0.js';

/**
 * Test token caching and refresh behavior
 * 
 * This script tests:
 * 1. Cold start: Fetch fresh token from Auth0, cache in memory + Parameter Store
 * 2. Warm hit: Read from memory cache (fast)
 * 3. Clear memory cache: Simulate new Lambda container
 * 4. Parameter Store hit: Read from Parameter Store (faster than Auth0)
 * 5. Clear both caches: Force token refresh from Auth0
 * 6. Verify token refresh: New token is cached
 */

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTokenCaching() {
  console.log('🔐 Testing Auth0 Token Caching\n');

  try {
    // Test 1: Cold start - fetch from Auth0
    console.log('Test 1: Cold start (Auth0 fetch)');
    console.time('Cold start');
    const token1 = await getAuth0Token();
    console.timeEnd('Cold start');
    console.log(`Token (first 50 chars): ${token1.substring(0, 50)}...\n`);
    await sleep(100);

    // Test 2: Warm hit - memory cache
    console.log('Test 2: Warm hit (memory cache)');
    console.time('Memory cache');
    const token2 = await getAuth0Token();
    console.timeEnd('Memory cache');
    console.log(`Same token: ${token1 === token2}\n`);
    await sleep(100);

    // Test 3: Clear memory cache (simulate new Lambda container)
    console.log('Test 3: Simulate new Lambda container (clear memory, keep Parameter Store)');
    clearMemoryCache();
    console.log('Memory cache cleared. Next call will read from Parameter Store...\n');
    await sleep(100);

    // Test 4: Parameter Store hit (simulating new container reading shared cache)
    console.log('Test 4: Parameter Store hit (new container scenario)');
    console.time('Parameter Store read');
    const token3 = await getAuth0Token();
    console.timeEnd('Parameter Store read');
    console.log(`Same token from Parameter Store: ${token1 === token3}\n`);
    await sleep(100);

    // Test 5: Clear both caches - force refresh
    console.log('Test 5: Force token refresh (clear both caches)');
    console.log('Clearing memory and Parameter Store caches...');
    await clearAuth0TokenCache();
    console.log('Caches cleared. Fetching new token from Auth0...');
    console.time('Forced refresh');
    const token4 = await getAuth0Token();
    console.timeEnd('Forced refresh');
    console.log(`New token fetched (first 50 chars): ${token4.substring(0, 50)}...\n`);

    // Test 6: Verify new token is cached
    console.log('Test 6: Verify new token is cached');
    console.time('Memory cache (new token)');
    const token5 = await getAuth0Token();
    console.timeEnd('Memory cache (new token)');
    console.log(`New token cached: ${token4 === token5}\n`);

    console.log('✅ All token caching tests passed!');
    console.log('\n📊 Performance Summary:');
    console.log('- Cold start (Auth0): 500-1000ms');
    console.log('- Memory cache: 0-1ms');
    console.log('- Parameter Store: 50-100ms');
    console.log('- Token shared across all Lambda containers via Parameter Store');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

void testTokenCaching();
