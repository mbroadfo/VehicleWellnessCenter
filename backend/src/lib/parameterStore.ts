import { 
  SSMClient, 
  GetParameterCommand, 
  PutParameterCommand,
  ParameterType 
} from '@aws-sdk/client-ssm';

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
  GOOGLE_API_KEY?: string;
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

/**
 * Get a single parameter from Parameter Store
 * Generic function for cache storage and other uses
 *
 * @param name - Parameter name (e.g., /vwc/cache/vin:123)
 * @returns Parameter value as string
 * @throws Error if parameter not found
 */
export async function getParameter(name: string): Promise<string> {
  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: true
    });

    const response = await ssmClient.send(command);

    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${name} not found or empty`);
    }

    return response.Parameter.Value;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get parameter ${name}: ${errorMessage}`);
  }
}

/**
 * Put a parameter into Parameter Store
 * Used for caching external API results
 *
 * @param name - Parameter name (e.g., /vwc/cache/vin:123)
 * @param value - Parameter value as string
 * @param type - Parameter type (default: String)
 */
export async function putParameter(
  name: string, 
  value: string, 
  type: ParameterType = ParameterType.STRING
): Promise<void> {
  try {
    const command = new PutParameterCommand({
      Name: name,
      Value: value,
      Type: type,
      Overwrite: true  // Always overwrite for cache updates
    });

    await ssmClient.send(command);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to put parameter ${name}: ${errorMessage}`);
  }
}
