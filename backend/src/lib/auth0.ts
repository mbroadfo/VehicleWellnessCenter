/**
 * Auth0 Client Credentials Flow with Two-Tier Caching
 * 
 * Provides M2M token retrieval for automated testing and admin operations.
 * Implements two-tier caching to minimize Auth0 API calls:
 * 
 * Tier 1: Memory cache (fastest, container-specific, ~15-45 minute lifetime)
 * Tier 2: Parameter Store (shared across all Lambda containers, persistent)
 * 
 * This reduces Auth0 token requests by 70-90% and improves Lambda cold start performance.
 */

import { getSecrets } from './mongodb';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

// Tier 1: Memory cache (fastest, container-specific)
let memoryCache: CachedToken | null = null;

// Tier 2: Parameter Store (shared across containers)
const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-west-2'
});

const PARAMETER_NAME = process.env.AUTH0_TOKEN_PARAMETER_NAME || '/vwc/dev/auth0-token-cache';
const BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer before expiration

/**
 * Get cached token from Parameter Store
 * Returns null if not found or expired
 */
async function getTokenFromParameterStore(): Promise<CachedToken | null> {
  try {
    const command = new GetParameterCommand({
      Name: PARAMETER_NAME
    });
    const response = await ssmClient.send(command);
    
    if (!response.Parameter?.Value) {
      return null;
    }
    
    // Token value format: "token|expiresAt" (pipe-delimited)
    const parts = response.Parameter.Value.split('|');
    if (parts.length !== 2) {
      return null; // Invalid format
    }
    
    const token = parts[0];
    const expiresAt = parseInt(parts[1], 10);
    
    if (isNaN(expiresAt)) {
      return null; // Invalid expiration
    }
    
    const now = Date.now();
    
    // Check if token is still valid
    if (expiresAt <= now + BUFFER_MS) {
      return null; // Expired or too close to expiration
    }
    
    return {
      token,
      expiresAt
    };
  } catch (error) {
    // Parameter not found or access denied - return null (graceful degradation)
    console.warn('Failed to get token from Parameter Store:', error);
    return null;
  }
}

/**
 * Save token to Parameter Store with expiration metadata
 * Format: "token|expiresAt" (pipe-delimited for easy parsing)
 */
async function saveTokenToParameterStore(token: string, expiresAt: number): Promise<void> {
  try {
    const value = `${token}|${expiresAt}`;
    const command = new PutParameterCommand({
      Name: PARAMETER_NAME,
      Value: value,
      Type: 'String',
      Overwrite: true
    });
    await ssmClient.send(command);
  } catch (error) {
    // Log but don't fail - memory cache still works (graceful degradation)
    console.error('Failed to save token to Parameter Store:', error);
  }
}

/**
 * Fetch new token from Auth0
 */
async function fetchNewToken(): Promise<CachedToken> {
  const secrets = await getSecrets();
  
  const domain: string = secrets.AUTH0_DOMAIN;
  const clientId: string = secrets.AUTH0_M2M_CLIENT_ID;
  const clientSecret: string = secrets.AUTH0_M2M_CLIENT_SECRET;
  const audience: string = secrets.AUTH0_AUDIENCE;
  
  const tokenUrl = `https://${domain}/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: audience,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get Auth0 token: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const data = (await response.json()) as Auth0TokenResponse;
  const now = Date.now();
  const expiresAt = now + (data.expires_in * 1000); // Convert seconds to milliseconds
  
  return {
    token: data.access_token,
    expiresAt
  };
}

/**
 * Get an Auth0 access token using Client Credentials flow (M2M)
 * 
 * Uses two-tier caching:
 * 1. Memory cache (fastest, container-specific)
 * 2. Parameter Store (shared across all Lambda containers)
 * 
 * Falls back gracefully if Parameter Store is unavailable.
 * 
 * @returns Access token string
 * @throws Error if token retrieval fails
 */
export async function getAuth0Token(): Promise<string> {
  const now = Date.now();
  
  // Tier 1: Check memory cache (fastest, 0-1ms)
  if (memoryCache && memoryCache.expiresAt > now + BUFFER_MS) {
    return memoryCache.token;
  }
  
  // Tier 2: Check Parameter Store (shared across containers, 50-100ms)
  const cachedToken = await getTokenFromParameterStore();
  if (cachedToken) {
    // Update memory cache for next invocation
    memoryCache = cachedToken;
    return cachedToken.token;
  }
  
  // Tier 3: Fetch new token from Auth0 (500-1000ms)
  const newToken = await fetchNewToken();
  
  // Update both caches
  memoryCache = newToken;
  await saveTokenToParameterStore(newToken.token, newToken.expiresAt);
  
  return newToken.token;
}

/**
 * Clear both memory and Parameter Store caches (useful for testing)
 */
export async function clearAuth0TokenCache(): Promise<void> {
  memoryCache = null;
  try {
    await saveTokenToParameterStore('', 0); // Clear Parameter Store
  } catch {
    // Ignore errors during cache clear
  }
}

/**
 * Clear only memory cache (simulates new Lambda container)
 */
export function clearMemoryCache(): void {
  memoryCache = null;
}
