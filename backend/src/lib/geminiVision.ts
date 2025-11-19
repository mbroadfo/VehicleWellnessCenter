/**
 * Gemini Vision API helper for analyzing images and extracting structured data
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecrets } from './mongodb.js';

// Initialize Gemini client (lazy-loaded)
let genAI: GoogleGenerativeAI | null = null;

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (!genAI) {
    const secrets = await getSecrets();
    const apiKey = secrets.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not found in Parameter Store secrets');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export interface ImageAnalysisOptions {
  prompt: string;
  model?: string; // Default: gemini-2.0-flash-exp
  temperature?: number;
  maxRetries?: number;
}

export interface ImageAnalysisResult<T = unknown> {
  data: T;
  confidence: 'high' | 'medium' | 'low';
  rawResponse: string;
}

/**
 * Analyze an image using Gemini Vision and extract structured data
 * 
 * @param imageBuffer - Image as Buffer (PNG, JPEG, WebP)
 * @param options - Analysis options including prompt and model
 * @returns Parsed structured data from the image
 */
export async function analyzeImage<T = unknown>(
  imageBuffer: Buffer,
  options: ImageAnalysisOptions
): Promise<ImageAnalysisResult<T>> {
  const client = await getGeminiClient();
  const model = client.getGenerativeModel({ 
    model: options.model || 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: options.temperature || 0.1, // Low temperature for factual extraction
      responseMimeType: 'application/json', // Force JSON output
    }
  });

  const maxRetries = options.maxRetries || 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini Vision] Analyzing image (attempt ${attempt}/${maxRetries})...`);

      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const mimeType = detectMimeType(imageBuffer);

      // Generate content with vision
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: options.prompt },
      ]);

      const response = result.response;
      const text = response.text();

      console.log(`[Gemini Vision] Response received: ${text.substring(0, 200)}...`);

      // Parse JSON response
      const data = JSON.parse(text) as T;

      // Determine confidence based on response structure
      const confidence = determineConfidence(data);

      return {
        data,
        confidence,
        rawResponse: text,
      };

    } catch (error) {
      lastError = error as Error;
      console.error(`[Gemini Vision] Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Exponential backoff
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[Gemini Vision] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`[Gemini Vision] Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Detect MIME type from image buffer
 */
function detectMimeType(buffer: Buffer): string {
  const header = buffer.toString('hex', 0, 4);
  
  if (header.startsWith('89504e47')) {
    return 'image/png';
  } else if (header.startsWith('ffd8ff')) {
    return 'image/jpeg';
  } else if (header.startsWith('52494646') && buffer.toString('hex', 8, 12).startsWith('57454250')) {
    return 'image/webp';
  }
  
  // Default to PNG
  return 'image/png';
}

/**
 * Determine confidence level based on response structure
 */
function determineConfidence(data: unknown): 'high' | 'medium' | 'low' {
  if (!data || typeof data !== 'object') {
    return 'low';
  }

  const obj = data as Record<string, unknown>;

  // If response explicitly includes confidence, use it
  if ('confidence' in obj && typeof obj.confidence === 'string') {
    return obj.confidence as 'high' | 'medium' | 'low';
  }

  // Count how many expected fields are present and have valid values
  const totalFields = Object.keys(obj).length;
  const nullFields = Object.values(obj).filter(v => v === null || v === undefined).length;
  const validFields = totalFields - nullFields;

  if (validFields >= totalFields * 0.8) {
    return 'high';
  } else if (validFields >= totalFields * 0.5) {
    return 'medium';
  } else {
    return 'low';
  }
}
