/**
 * VIN Validation Utility
 * Implements ISO 3779 standard for Vehicle Identification Numbers
 */

// ============================================================================
// VIN Validation Constants
// ============================================================================

// Character transliteration map (ISO 3779)
const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
};

// Weight factors for check digit calculation
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Invalid characters in VIN (ISO 3779)
const INVALID_VIN_CHARS = /[IOQioq]/;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate VIN format and check digit
 * 
 * Implements ISO 3779 standard:
 * - 17 characters (alphanumeric, excluding I, O, Q)
 * - Position 9 is check digit (0-9 or X)
 * - Check digit calculated using weighted sum modulo 11
 * 
 * @param vin - Vehicle Identification Number
 * @returns true if valid, false otherwise
 */
export function isValidVIN(vin: string): boolean {
  // Normalize to uppercase
  const normalizedVIN = vin.toUpperCase().trim();

  // Check length
  if (normalizedVIN.length !== 17) {
    return false;
  }

  // Check for invalid characters (I, O, Q)
  if (INVALID_VIN_CHARS.test(normalizedVIN)) {
    return false;
  }

  // Calculate check digit
  const calculatedCheckDigit = calculateCheckDigit(normalizedVIN);
  const actualCheckDigit = normalizedVIN[8]; // Position 9 (0-indexed)

  return calculatedCheckDigit === actualCheckDigit;
}

/**
 * Calculate VIN check digit per ISO 3779
 * 
 * Algorithm:
 * 1. Transliterate each character to its numeric value
 * 2. Multiply by position weight factor
 * 3. Sum all products
 * 4. Take modulo 11
 * 5. If 10, check digit is 'X', otherwise the digit itself
 * 
 * @param vin - 17-character VIN (uppercase)
 * @returns Check digit ('0'-'9' or 'X')
 */
function calculateCheckDigit(vin: string): string {
  let sum = 0;

  for (let i = 0; i < 17; i++) {
    const char = vin[i];
    const value = VIN_TRANSLITERATION[char];

    if (value === undefined) {
      // Invalid character encountered
      return '';
    }

    sum += value * VIN_WEIGHTS[i];
  }

  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * Extract basic info from VIN structure
 * 
 * VIN Structure (simplified):
 * - Positions 1-3: World Manufacturer Identifier (WMI)
 * - Positions 4-8: Vehicle Descriptor Section (VDS)
 * - Position 9: Check digit
 * - Position 10: Model year
 * - Position 11: Plant code
 * - Positions 12-17: Sequential number
 * 
 * @param vin - Vehicle Identification Number
 * @returns Partial VIN info or null if invalid
 */
export function parseVINStructure(vin: string): {
  wmi: string;
  vds: string;
  checkDigit: string;
  modelYear: string;
  plantCode: string;
  serial: string;
} | null {
  const normalizedVIN = vin.toUpperCase().trim();

  if (!isValidVIN(normalizedVIN)) {
    return null;
  }

  return {
    wmi: normalizedVIN.substring(0, 3),           // Manufacturer
    vds: normalizedVIN.substring(3, 8),           // Vehicle descriptor
    checkDigit: normalizedVIN[8],                 // Check digit
    modelYear: normalizedVIN[9],                  // Model year code
    plantCode: normalizedVIN[10],                 // Manufacturing plant
    serial: normalizedVIN.substring(11, 17)       // Serial number
  };
}

/**
 * Decode model year from VIN character
 * 
 * Position 10 in VIN represents model year:
 * - A-Y = 1980-2000, 2010-2030 (skipping I, O, Q, U, Z)
 * - 1-9 = 2001-2009, 2031-2039
 * 
 * Note: This is ambiguous for 30-year cycles
 * Use context (e.g., current year) to disambiguate
 * 
 * @param yearCode - Single character from position 10
 * @param currentYear - Current year for disambiguation (default: current)
 * @returns Model year or null if invalid
 */
export function decodeModelYear(yearCode: string, currentYear?: number): number | null {
  const code = yearCode.toUpperCase();
  const now = currentYear || new Date().getFullYear();
  
  // Year codes mapping
  const codes = 'ABCDEFGHJKLMNPRSTVWXY123456789';
  const years = [
    1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, // A-J
    1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, // K-T
    2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009  // V-W, X-Y, 1-9
  ];
  
  const index = codes.indexOf(code);
  if (index === -1) {
    return null;
  }
  
  let baseYear = years[index];
  
  // Disambiguate 30-year cycle
  // If baseYear is more than 20 years in the past, add 30
  if (now - baseYear > 20) {
    baseYear += 30;
  }
  
  return baseYear;
}

/**
 * Sanitize VIN input (remove spaces, hyphens, convert to uppercase)
 * 
 * @param vin - Raw VIN input
 * @returns Sanitized VIN
 */
export function sanitizeVIN(vin: string): string {
  return vin
    .replace(/[\s-]/g, '')  // Remove spaces and hyphens
    .toUpperCase()
    .trim();
}

/**
 * Validate and return error message if invalid
 * 
 * @param vin - Vehicle Identification Number
 * @returns null if valid, error message if invalid
 */
export function getVINValidationError(vin: string): string | null {
  const sanitized = sanitizeVIN(vin);
  
  if (sanitized.length === 0) {
    return 'VIN is required';
  }
  
  if (sanitized.length !== 17) {
    return `VIN must be exactly 17 characters (got ${sanitized.length})`;
  }
  
  if (INVALID_VIN_CHARS.test(sanitized)) {
    return 'VIN cannot contain the letters I, O, or Q';
  }
  
  if (!isValidVIN(sanitized)) {
    return 'Invalid VIN check digit';
  }
  
  return null;
}
