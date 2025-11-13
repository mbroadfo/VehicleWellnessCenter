/**
 * Auth0 Client Credentials Flow
 * 
 * Provides M2M token retrieval for automated testing and admin operations.
 * Implements token caching to avoid rate limits.
 */

import { getSecrets } from './mongodb';

interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let cachedToken: CachedToken | null = null;

/**
 * Get an Auth0 access token using Client Credentials flow (M2M)
 * 
 * This retrieves a machine-to-machine token for automated testing
 * and admin operations. Tokens are cached and reused until they expire.
 * Tokens are refreshed 5 minutes before expiration to ensure validity.
 * 
 * @returns Access token string
 * @throws Error if token retrieval fails
 */
export async function getAuth0Token(): Promise<string> {
  // Check if we have a valid cached token (with 5-minute buffer before expiration)
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  
  if (cachedToken && cachedToken.expiresAt > now + bufferMs) {
    return cachedToken.token;
  }
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
  
  // Cache the token with expiration time
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in * 1000), // Convert seconds to milliseconds
  };
  
  return cachedToken.token;
}

/**
 * Clear the cached token (useful for testing or forcing refresh)
 */
export function clearAuth0TokenCache(): void {
  cachedToken = null;
}
