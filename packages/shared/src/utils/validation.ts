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

/**
 * Convert a string to a valid slug.
 *
 * @param input - The string to convert
 * @returns URL-safe slug
 */
export function toSlug(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Trim hyphens from start/end
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
// SSN Validation (US)
// =============================================================================

/**
 * Validate a US Social Security Number format.
 * Does not verify the SSN is real, only format.
 *
 * @param ssn - The SSN to validate (with or without dashes)
 * @returns True if SSN format is valid
 */
export function isValidSSN(ssn: string): boolean {
  if (!ssn || typeof ssn !== "string") {
    return false;
  }

  // Remove dashes
  const cleaned = ssn.replace(/-/g, "");

  // Must be 9 digits
  if (!/^\d{9}$/.test(cleaned)) {
    return false;
  }

  // Area number (first 3 digits) cannot be 000, 666, or 900-999
  const area = parseInt(cleaned.substring(0, 3), 10);
  if (area === 0 || area === 666 || (area >= 900 && area <= 999)) {
    return false;
  }

  // Group number (middle 2 digits) cannot be 00
  const group = parseInt(cleaned.substring(3, 5), 10);
  if (group === 0) {
    return false;
  }

  // Serial number (last 4 digits) cannot be 0000
  const serial = parseInt(cleaned.substring(5, 9), 10);
  if (serial === 0) {
    return false;
  }

  return true;
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
