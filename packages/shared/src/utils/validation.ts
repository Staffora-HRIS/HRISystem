/**
 * Validation Utilities
 *
 * Helper functions for validating input data including
 * email, UUID, password strength, and string sanitization.
 */

// =============================================================================
// Email Validation
// =============================================================================

/**
 * RFC 5322 compliant email regex pattern.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate an email address format.
 *
 * @param email - The email address to validate
 * @returns True if email format is valid
 *
 * @example
 * ```typescript
 * isValidEmail("user@example.com") // true
 * isValidEmail("invalid-email") // false
 * ```
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }
  if (email.length > 254) {
    return false;
  }
  return EMAIL_REGEX.test(email);
}

// =============================================================================
// UUID Validation
// =============================================================================

/**
 * UUID v4 regex pattern.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generic UUID regex pattern (any version).
 */
const UUID_ANY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a UUID string (any version).
 *
 * @param uuid - The string to validate
 * @returns True if string is a valid UUID
 *
 * @example
 * ```typescript
 * isValidUUID("550e8400-e29b-41d4-a716-446655440000") // true
 * isValidUUID("not-a-uuid") // false
 * ```
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") {
    return false;
  }
  return UUID_ANY_REGEX.test(uuid);
}

/**
 * Validate a UUID v4 string specifically.
 *
 * @param uuid - The string to validate
 * @returns True if string is a valid UUID v4
 */
export function isValidUUIDv4(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") {
    return false;
  }
  return UUID_REGEX.test(uuid);
}

// =============================================================================
// Password Validation
// =============================================================================

/**
 * Password validation options.
 */
export interface PasswordValidationOptions {
  /** Minimum length (default: 8) */
  minLength?: number;
  /** Maximum length (default: 128) */
  maxLength?: number;
  /** Require uppercase letter (default: true) */
  requireUppercase?: boolean;
  /** Require lowercase letter (default: true) */
  requireLowercase?: boolean;
  /** Require number (default: true) */
  requireNumber?: boolean;
  /** Require special character (default: true) */
  requireSpecial?: boolean;
  /** Allowed special characters (default: standard set) */
  allowedSpecialChars?: string;
}

/**
 * Password validation result.
 */
export interface PasswordValidationResult {
  /** Whether password is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Password strength score (0-100) */
  strength: number;
}

const DEFAULT_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/`~";

/**
 * Validate password strength.
 *
 * @param password - The password to validate
 * @param options - Validation options
 * @returns Validation result with errors and strength score
 *
 * @example
 * ```typescript
 * const result = isStrongPassword("MyP@ssw0rd!");
 * if (result.isValid) {
 *   console.log("Password strength:", result.strength);
 * } else {
 *   console.log("Errors:", result.errors);
 * }
 * ```
 */
export function isStrongPassword(
  password: string,
  options: PasswordValidationOptions = {}
): PasswordValidationResult {
  const {
    minLength = 8,
    maxLength = 128,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = true,
    allowedSpecialChars = DEFAULT_SPECIAL_CHARS,
  } = options;

  const errors: string[] = [];
  let strength = 0;

  if (!password || typeof password !== "string") {
    return { isValid: false, errors: ["Password is required"], strength: 0 };
  }

  // Length checks
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  } else {
    strength += 20;
    if (password.length >= 12) strength += 10;
    if (password.length >= 16) strength += 10;
  }

  if (password.length > maxLength) {
    errors.push(`Password must be no more than ${maxLength} characters`);
  }

  // Uppercase check
  const hasUppercase = /[A-Z]/.test(password);
  if (requireUppercase && !hasUppercase) {
    errors.push("Password must contain at least one uppercase letter");
  } else if (hasUppercase) {
    strength += 15;
  }

  // Lowercase check
  const hasLowercase = /[a-z]/.test(password);
  if (requireLowercase && !hasLowercase) {
    errors.push("Password must contain at least one lowercase letter");
  } else if (hasLowercase) {
    strength += 15;
  }

  // Number check
  const hasNumber = /[0-9]/.test(password);
  if (requireNumber && !hasNumber) {
    errors.push("Password must contain at least one number");
  } else if (hasNumber) {
    strength += 15;
  }

  // Special character check
  const specialRegex = new RegExp(
    `[${allowedSpecialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}]`
  );
  const hasSpecial = specialRegex.test(password);
  if (requireSpecial && !hasSpecial) {
    errors.push("Password must contain at least one special character");
  } else if (hasSpecial) {
    strength += 15;
  }

  // Bonus for variety
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.7) {
    strength += 10;
  }

  // Cap strength at 100
  strength = Math.min(100, strength);

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
}

// =============================================================================
// String Sanitization
// =============================================================================

/**
 * Sanitize a string by removing potentially dangerous characters.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Escape HTML special characters to prevent XSS.
 *
 * @param input - The string to escape
 * @returns HTML-escaped string
 *
 * @example
 * ```typescript
 * escapeHtml("<script>alert('xss')</script>")
 * // "&lt;script&gt;alert('xss')&lt;/script&gt;"
 * ```
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
  };

  return input.replace(/[&<>"'`=/]/g, (char) => escapeMap[char] ?? char);
}

/**
 * Unescape HTML entities back to characters.
 *
 * @param input - The HTML-escaped string
 * @returns Unescaped string
 */
export function unescapeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  const unescapeMap: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x2F;": "/",
    "&#x60;": "`",
    "&#x3D;": "=",
  };

  return input.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&#x2F;|&#x60;|&#x3D;/g,
    (match) => unescapeMap[match] ?? match
  );
}

// =============================================================================
// URL Validation
// =============================================================================

/**
 * Validate a URL string.
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns True if URL is valid
 */
export function isValidUrl(
  url: string,
  options: { allowedProtocols?: string[] } = {}
): boolean {
  const { allowedProtocols = ["http:", "https:"] } = options;

  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

// =============================================================================
// Phone Number Validation
// =============================================================================

/**
 * Basic phone number validation (international format).
 * For production, consider using a library like libphonenumber-js.
 *
 * @param phone - The phone number to validate
 * @returns True if phone format appears valid
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") {
    return false;
  }

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-().]/g, "");

  // Check if it's a reasonable phone number
  // International format: +[country code][number] (7-15 digits total)
  const phoneRegex = /^\+?[1-9]\d{6,14}$/;

  return phoneRegex.test(cleaned);
}

// =============================================================================
// Slug Validation
// =============================================================================

/**
 * Validate a URL slug.
 *
 * @param slug - The slug to validate
 * @returns True if slug is valid
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") {
    return false;
  }

  // Lowercase letters, numbers, and hyphens only
  // Must start and end with alphanumeric
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  return slugRegex.test(slug) && slug.length >= 2 && slug.length <= 100;
}


// =============================================================================
// Employee Number Validation
// =============================================================================

/**
 * Validate an employee number format.
 *
 * @param empNumber - The employee number to validate
 * @param pattern - Optional regex pattern (default: alphanumeric, 3-20 chars)
 * @returns True if employee number is valid
 */
export function isValidEmployeeNumber(
  empNumber: string,
  pattern?: RegExp
): boolean {
  if (!empNumber || typeof empNumber !== "string") {
    return false;
  }

  const defaultPattern = /^[A-Z0-9]{3,20}$/i;
  return (pattern || defaultPattern).test(empNumber);
}

// =============================================================================
// National Insurance Number Validation (UK)
// =============================================================================

/**
 * Validate a UK National Insurance Number (NINO) format.
 * Format: 2 prefix letters + 6 digits + 1 suffix letter (A/B/C/D).
 * Does not verify the NINO is real, only format.
 *
 * HMRC rules:
 * - Prefix cannot be BG, GB, NK, KN, TN, NT, ZZ
 * - First letter cannot be D, F, I, Q, U, V
 * - Second letter cannot be D, F, I, O, Q, U, V
 * - Suffix must be A, B, C, or D
 *
 * @param nino - The NINO to validate (with or without spaces)
 * @returns True if NINO format is valid
 *
 * @example
 * ```typescript
 * isValidNINO("AB123456C") // true
 * isValidNINO("AB 12 34 56 C") // true
 * isValidNINO("QQ123456C") // false (invalid prefix)
 * ```
 */
export function isValidNINO(nino: string): boolean {
  if (!nino || typeof nino !== "string") {
    return false;
  }

  // Remove spaces and convert to uppercase
  const cleaned = nino.replace(/\s/g, "").toUpperCase();

  // Must match: 2 letters + 6 digits + 1 letter
  if (!/^[A-Z]{2}\d{6}[A-Z]$/.test(cleaned)) {
    return false;
  }

  const prefix = cleaned.substring(0, 2);
  const firstLetter = cleaned[0];
  const secondLetter = cleaned[1];
  const suffix = cleaned[8];

  // Invalid prefixes per HMRC
  const invalidPrefixes = ["BG", "GB", "NK", "KN", "TN", "NT", "ZZ"];
  if (invalidPrefixes.includes(prefix)) {
    return false;
  }

  // First letter cannot be D, F, I, Q, U, V
  if ("DFIQUV".includes(firstLetter)) {
    return false;
  }

  // Second letter cannot be D, F, I, O, Q, U, V
  if ("DFIOGUV".includes(secondLetter)) {
    return false;
  }

  // Suffix must be A, B, C, or D
  if (!"ABCD".includes(suffix)) {
    return false;
  }

  return true;
}

// =============================================================================
// UK Postcode Validation
// =============================================================================

/**
 * Validate a UK postcode format.
 * Supports all valid UK postcode formats per Royal Mail PAF specification.
 *
 * Valid formats: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 * Also accepts BFPO postcodes.
 *
 * @param postcode - The postcode to validate (with or without space)
 * @returns True if postcode format is valid
 *
 * @example
 * ```typescript
 * isValidUKPostcode("SW1A 1AA") // true
 * isValidUKPostcode("EC1A 1BB") // true
 * isValidUKPostcode("M1 1AE") // true
 * isValidUKPostcode("12345") // false
 * ```
 */
export function isValidUKPostcode(postcode: string): boolean {
  if (!postcode || typeof postcode !== "string") {
    return false;
  }

  // Remove spaces and convert to uppercase
  const cleaned = postcode.replace(/\s/g, "").toUpperCase();

  // UK postcode regex covering all valid formats
  // Format: A(A)9(9/A) 9AA where () = optional
  const postcodeRegex =
    /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;

  // Also accept BFPO postcodes
  const bfpoRegex = /^BFPO\d{1,4}$/;

  return postcodeRegex.test(cleaned) || bfpoRegex.test(cleaned);
}

// =============================================================================
// Input Truncation
// =============================================================================

/**
 * Truncate a string to a maximum length.
 *
 * @param input - The string to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add when truncated (default: "...")
 * @returns Truncated string
 */
export function truncate(
  input: string,
  maxLength: number,
  suffix: string = "..."
): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  if (input.length <= maxLength) {
    return input;
  }

  return input.substring(0, maxLength - suffix.length) + suffix;
}
