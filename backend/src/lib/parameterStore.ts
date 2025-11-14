import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-west-2'
});

export interface AppSecrets {
  MONGODB_ATLAS_HOST: string;
  MONGODB_ATLAS_USERNAME: string;
  MONGODB_ATLAS_PASSWORD: string;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  AUTH0_M2M_CLIENT_ID: string;
  AUTH0_M2M_CLIENT_SECRET: string;
  GOOGLE_GEMINI_API_KEY?: string;
}

let cachedSecrets: AppSecrets | null = null;

/**
 * Get application secrets from Parameter Store
 *
 * Reads from SSM parameter at /vwc/{env}/secrets
 * Caches in memory for Lambda container lifetime
 * Expects JSON SecureString parameter
 *
 * @returns Application secrets object
 * @throws Error if parameter not found or invalid JSON
 */
export async function getSecretsFromParameterStore(): Promise<AppSecrets> {
  // Return cached secrets if available
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const parameterName = process.env.SSM_SECRETS_PARAMETER_NAME || '/vwc/dev/secrets';

  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true  // Decrypt SecureString values
    });

    const response = await ssmClient.send(command);

    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${parameterName} not found or empty`);
    }

    // Parse JSON value
    const secrets = JSON.parse(response.Parameter.Value) as AppSecrets;

    // Validate required fields
    const requiredFields = [
      'MONGODB_ATLAS_HOST',
      'MONGODB_ATLAS_USERNAME',
      'MONGODB_ATLAS_PASSWORD',
      'AUTH0_DOMAIN',
      'AUTH0_AUDIENCE',
      'AUTH0_M2M_CLIENT_ID',
      'AUTH0_M2M_CLIENT_SECRET'
    ];

    for (const field of requiredFields) {
      if (!secrets[field as keyof AppSecrets]) {
        throw new Error(`Missing required secret field: ${field}`);
      }
    }

    // Cache for container lifetime
    cachedSecrets = secrets;
    return secrets;

  } catch (error) {
    console.error('Failed to get secrets from Parameter Store:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Parameter Store secrets retrieval failed: ${errorMessage}`);
  }
}

/**
 * Clear cached secrets (useful for testing)
 */
export function clearSecretsCache(): void {
  cachedSecrets = null;
}
