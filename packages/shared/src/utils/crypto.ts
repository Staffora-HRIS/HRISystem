/**
 * Crypto Utilities
 *
 * Helper functions for generating IDs, hashing strings,
 * and generating secure tokens.
 */

import { randomBytes, createHash, pbkdf2Sync, timingSafeEqual } from "crypto";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Generate a uniformly distributed random integer in the range [0, range).
 *
 * Uses rejection sampling over a 32-bit unsigned random integer to eliminate
 * the modulo bias that would occur if we simply did `randomBytes(N) % range`
 * when `range` does not evenly divide 2^N.
 *
 * @param range - Exclusive upper bound (must be a positive integer <= 2^32)
 * @returns Uniformly distributed integer in [0, range)
 */
function unbiasedRandomInt(range: number): number {
  if (!Number.isInteger(range) || range <= 0) {
    throw new Error("range must be a positive integer");
  }

  const MAX = 0x100000000; // 2^32
  // Largest multiple of `range` that fits in [0, MAX). Values >= threshold
  // would skew the distribution and must be rejected.
  const threshold = Math.floor(MAX / range) * range;

  // Loop is bounded in expectation: rejection probability is at most 50%
  // per iteration regardless of `range`, so this terminates quickly.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const value = randomBytes(4).readUInt32BE(0);
    if (value < threshold) {
      return value % range;
    }
  }
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a UUID v4.
 *
 * @returns UUID v4 string
 *
 * @example
 * ```typescript
 * const id = generateId();
 * // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateId(): string {
  // Using crypto.randomUUID if available (Node 14.17+), otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  const bytes = randomBytes(16);

  // Set version (4) and variant (8, 9, A, or B)
  const byte6 = bytes[6];
  const byte8 = bytes[8];
  if (byte6 !== undefined) bytes[6] = (byte6 & 0x0f) | 0x40;
  if (byte8 !== undefined) bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Generate a short, URL-safe ID.
 *
 * @param length - Length of the ID (default: 12)
 * @returns URL-safe ID string
 *
 * @example
 * ```typescript
 * const shortId = generateShortId();
 * // "aB3xY9kL2mNp"
 * ```
 */
export function generateShortId(length: number = 12): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    // Use rejection sampling to avoid modulo bias (chars.length = 62
    // does not evenly divide 2^8 or 2^32).
    result += chars[unbiasedRandomInt(chars.length)];
  }

  return result;
}

/**
 * Generate a numeric code (e.g., for MFA).
 *
 * @param length - Length of the code (default: 6)
 * @returns Numeric code string
 */
export function generateNumericCode(length: number = 6): string {
  let code = "";

  for (let i = 0; i < length; i++) {
    // Use rejection sampling to avoid modulo bias (10 does not evenly
    // divide 2^8 or 2^32 — naive `byte % 10` over-represents 0-5).
    code += unbiasedRandomInt(10).toString();
  }

  return code;
}

/**
 * Generate a secure random token.
 *
 * @param byteLength - Number of random bytes (default: 32)
 * @returns Hex-encoded token string
 */
export function generateToken(byteLength: number = 32): string {
  return randomBytes(byteLength).toString("hex");
}

/**
 * Generate a URL-safe base64 token.
 *
 * @param byteLength - Number of random bytes (default: 32)
 * @returns URL-safe base64 token string
 */
export function generateUrlSafeToken(byteLength: number = 32): string {
  return randomBytes(byteLength)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// =============================================================================
// Hashing
// =============================================================================

/**
 * Hash a string using SHA-256.
 *
 * @param input - The string to hash
 * @returns SHA-256 hash as hex string
 *
 * @example
 * ```typescript
 * const hash = hashString("my-data");
 * ```
 */
export function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Hash a string using SHA-512.
 *
 * @param input - The string to hash
 * @returns SHA-512 hash as hex string
 */
export function hashStringSHA512(input: string): string {
  return createHash("sha512").update(input).digest("hex");
}

/**
 * Hash a string using MD5.
 * WARNING: MD5 is not secure for passwords. Use only for checksums.
 *
 * @param input - The string to hash
 * @returns MD5 hash as hex string
 */
export function hashMD5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

// =============================================================================
// Password Hashing (PBKDF2)
// =============================================================================

/** Password hash configuration */
interface PasswordHashConfig {
  /** Number of iterations (default: 100000) */
  iterations?: number;
  /** Salt length in bytes (default: 16) */
  saltLength?: number;
  /** Key length in bytes (default: 64) */
  keyLength?: number;
  /** Hash digest algorithm (default: sha512) */
  digest?: string;
}

/**
 * Hash a password using PBKDF2.
 *
 * @param password - The password to hash
 * @param config - Hash configuration
 * @returns Hash string in format: iterations:salt:hash
 *
 * @example
 * ```typescript
 * const hash = hashPassword("myPassword123");
 * // Store this hash in the database
 * ```
 */
export function hashPassword(
  password: string,
  config: PasswordHashConfig = {}
): string {
  const {
    iterations = 100000,
    saltLength = 16,
    keyLength = 64,
    digest = "sha512",
  } = config;

  const salt = randomBytes(saltLength).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString(
    "hex"
  );

  return `${iterations}:${salt}:${hash}`;
}

/**
 * Verify a password against a PBKDF2 hash.
 *
 * @param password - The password to verify
 * @param storedHash - The stored hash string
 * @returns True if password matches
 *
 * @example
 * ```typescript
 * const isValid = verifyPassword("myPassword123", storedHash);
 * ```
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [iterationsStr, salt, hash] = storedHash.split(":");

    if (!iterationsStr || !salt || !hash) {
      return false;
    }

    const iterations = parseInt(iterationsStr, 10);
    const keyLength = hash.length / 2; // hex string is 2 chars per byte
    const digest = "sha512";

    const derivedHash = pbkdf2Sync(
      password,
      salt,
      iterations,
      keyLength,
      digest
    ).toString("hex");

    // Use timing-safe comparison to prevent timing attacks
    const hashBuffer = Buffer.from(hash, "hex");
    const derivedBuffer = Buffer.from(derivedHash, "hex");

    if (hashBuffer.length !== derivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(hashBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

// =============================================================================
// Generic Hash Verification
// =============================================================================

/**
 * Verify a string against its SHA-256 hash using timing-safe comparison.
 *
 * @param input - The string to verify
 * @param hash - The expected hash
 * @returns True if hashes match
 */
export function verifyHash(input: string, hash: string): boolean {
  try {
    const computedHash = hashString(input);

    const hashBuffer = Buffer.from(hash, "hex");
    const computedBuffer = Buffer.from(computedHash, "hex");

    if (hashBuffer.length !== computedBuffer.length) {
      return false;
    }

    return timingSafeEqual(hashBuffer, computedBuffer);
  } catch {
    return false;
  }
}

// =============================================================================
// Token Utilities
// =============================================================================

/**
 * Generate a time-limited token with embedded expiration.
 *
 * @param payload - Data to include in token
 * @param expiresInMs - Expiration time in milliseconds
 * @returns Token string
 */
export function generateTimedToken(
  payload: string,
  expiresInMs: number
): string {
  const expiry = Date.now() + expiresInMs;
  const data = `${expiry}:${payload}`;
  const signature = hashString(data);
  return Buffer.from(`${data}:${signature}`).toString("base64url");
}

/**
 * Verify and decode a time-limited token.
 *
 * @param token - The token to verify
 * @returns Payload if valid and not expired, null otherwise
 */
export function verifyTimedToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");

    if (parts.length < 3) {
      return null;
    }

    const signature = parts.pop();
    if (!signature) {
      return null;
    }

    const data = parts.join(":");
    const expiryStr = parts[0];
    const payloadParts = parts.slice(1);
    const payload = payloadParts.join(":");

    // Verify signature
    if (!verifyHash(data, signature)) {
      return null;
    }

    // Check expiration
    if (!expiryStr) {
      return null;
    }
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// =============================================================================
// Checksum Utilities
// =============================================================================

/**
 * Calculate a CRC32 checksum for data integrity verification.
 *
 * @param data - The data to checksum
 * @returns CRC32 checksum as hex string
 */
export function calculateChecksum(data: string | Buffer): string {
  const buffer = typeof data === "string" ? Buffer.from(data) : data;
  return createHash("sha256").update(buffer).digest("hex").slice(0, 8);
}

/**
 * Verify data against a checksum.
 *
 * @param data - The data to verify
 * @param checksum - The expected checksum
 * @returns True if checksum matches
 */
export function verifyChecksum(data: string | Buffer, checksum: string): boolean {
  return calculateChecksum(data) === checksum;
}

// =============================================================================
// Encoding Utilities
// =============================================================================

/**
 * Encode data to base64.
 *
 * @param data - The data to encode
 * @returns Base64 encoded string
 */
export function toBase64(data: string | Buffer): string {
  const buffer = typeof data === "string" ? Buffer.from(data) : data;
  return buffer.toString("base64");
}

/**
 * Decode base64 data.
 *
 * @param encoded - The base64 encoded string
 * @returns Decoded string
 */
export function fromBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf8");
}

/**
 * Encode data to base64url (URL-safe base64).
 *
 * @param data - The data to encode
 * @returns Base64url encoded string
 */
export function toBase64Url(data: string | Buffer): string {
  const buffer = typeof data === "string" ? Buffer.from(data) : data;
  return buffer.toString("base64url");
}

/**
 * Decode base64url data.
 *
 * @param encoded - The base64url encoded string
 * @returns Decoded string
 */
export function fromBase64Url(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}
