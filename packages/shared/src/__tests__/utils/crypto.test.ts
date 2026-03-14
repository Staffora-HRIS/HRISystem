/**
 * Crypto Utilities Tests
 */

import { describe, test, expect } from "bun:test";
import {
  generateId,
  generateShortId,
  generateNumericCode,
  generateToken,
  generateUrlSafeToken,
  hashString,
  hashStringSHA512,
  hashMD5,
  hashPassword,
  verifyPassword,
  verifyHash,
  generateTimedToken,
  verifyTimedToken,
  calculateChecksum,
  verifyChecksum,
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
} from "../../utils/crypto";

describe("Crypto Utilities", () => {
  // ---------------------------------------------------------------------------
  // ID Generation
  // ---------------------------------------------------------------------------
  describe("generateId", () => {
    test("generates a valid UUID v4 format string", () => {
      const id = generateId();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(id)).toBe(true);
    });

    test("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });

    test("has correct length (36 characters with dashes)", () => {
      const id = generateId();
      expect(id.length).toBe(36);
    });
  });

  describe("generateShortId", () => {
    test("generates ID of default length (12)", () => {
      const id = generateShortId();
      expect(id.length).toBe(12);
    });

    test("generates ID of specified length", () => {
      const id = generateShortId(8);
      expect(id.length).toBe(8);
    });

    test("generates ID of length 1", () => {
      const id = generateShortId(1);
      expect(id.length).toBe(1);
    });

    test("generates unique short IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateShortId());
      }
      expect(ids.size).toBe(100);
    });

    test("contains only alphanumeric characters", () => {
      const id = generateShortId(50);
      expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
    });
  });

  describe("generateNumericCode", () => {
    test("generates code of default length (6)", () => {
      const code = generateNumericCode();
      expect(code.length).toBe(6);
    });

    test("generates code of specified length", () => {
      const code = generateNumericCode(8);
      expect(code.length).toBe(8);
    });

    test("contains only digits", () => {
      const code = generateNumericCode(20);
      expect(/^\d+$/.test(code)).toBe(true);
    });

    test("generates different codes on each call", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateNumericCode());
      }
      // With 6 digits, collisions are theoretically possible but extremely rare
      expect(codes.size).toBeGreaterThan(40);
    });
  });

  describe("generateToken", () => {
    test("generates hex token of default length (64 hex chars for 32 bytes)", () => {
      const token = generateToken();
      expect(token.length).toBe(64);
    });

    test("generates hex token of specified byte length", () => {
      const token = generateToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test("contains only hex characters", () => {
      const token = generateToken();
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    test("generates unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("generateUrlSafeToken", () => {
    test("generates URL-safe base64 token", () => {
      const token = generateUrlSafeToken();
      // Should not contain +, /, or = which are not URL-safe
      expect(token).not.toContain("+");
      expect(token).not.toContain("/");
      expect(token).not.toContain("=");
    });

    test("generates token of reasonable length", () => {
      const token = generateUrlSafeToken(32);
      // base64 encodes 3 bytes to 4 chars, 32 bytes ~ 43 chars
      expect(token.length).toBeGreaterThan(0);
    });

    test("generates unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(generateUrlSafeToken());
      }
      expect(tokens.size).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Hashing
  // ---------------------------------------------------------------------------
  describe("hashString", () => {
    test("returns SHA-256 hash as hex string", () => {
      const hash = hashString("hello");
      expect(hash.length).toBe(64); // SHA-256 = 256 bits = 64 hex chars
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    test("same input produces same hash", () => {
      const hash1 = hashString("test-data");
      const hash2 = hashString("test-data");
      expect(hash1).toBe(hash2);
    });

    test("different inputs produce different hashes", () => {
      const hash1 = hashString("input-a");
      const hash2 = hashString("input-b");
      expect(hash1).not.toBe(hash2);
    });

    test("empty string produces valid hash", () => {
      const hash = hashString("");
      expect(hash.length).toBe(64);
    });
  });

  describe("hashStringSHA512", () => {
    test("returns SHA-512 hash as hex string", () => {
      const hash = hashStringSHA512("hello");
      expect(hash.length).toBe(128); // SHA-512 = 512 bits = 128 hex chars
    });

    test("same input produces same hash", () => {
      const hash1 = hashStringSHA512("test");
      const hash2 = hashStringSHA512("test");
      expect(hash1).toBe(hash2);
    });

    test("different from SHA-256 of same input", () => {
      const sha256 = hashString("hello");
      const sha512 = hashStringSHA512("hello");
      expect(sha256).not.toBe(sha512);
    });
  });

  describe("hashMD5", () => {
    test("returns MD5 hash as hex string", () => {
      const hash = hashMD5("hello");
      expect(hash.length).toBe(32); // MD5 = 128 bits = 32 hex chars
    });

    test("same input produces same hash", () => {
      const hash1 = hashMD5("test");
      const hash2 = hashMD5("test");
      expect(hash1).toBe(hash2);
    });
  });

  // ---------------------------------------------------------------------------
  // Password Hashing
  // ---------------------------------------------------------------------------
  describe("hashPassword", () => {
    test("produces hash in iterations:salt:hash format", () => {
      const hash = hashPassword("myPassword123");
      const parts = hash.split(":");
      expect(parts.length).toBe(3);
      expect(parseInt(parts[0]!, 10)).toBeGreaterThan(0);
    });

    test("different calls produce different hashes (due to random salt)", () => {
      const hash1 = hashPassword("samePassword");
      const hash2 = hashPassword("samePassword");
      expect(hash1).not.toBe(hash2);
    });

    test("uses custom iterations", () => {
      const hash = hashPassword("test", { iterations: 50000 });
      const parts = hash.split(":");
      expect(parts[0]).toBe("50000");
    });
  });

  describe("verifyPassword", () => {
    test("verifies correct password", () => {
      const hash = hashPassword("correctPassword");
      expect(verifyPassword("correctPassword", hash)).toBe(true);
    });

    test("rejects incorrect password", () => {
      const hash = hashPassword("correctPassword");
      expect(verifyPassword("wrongPassword", hash)).toBe(false);
    });

    test("handles empty password", () => {
      const hash = hashPassword("");
      expect(verifyPassword("", hash)).toBe(true);
      expect(verifyPassword("not-empty", hash)).toBe(false);
    });

    test("returns false for malformed hash", () => {
      expect(verifyPassword("test", "invalid-hash")).toBe(false);
    });

    test("returns false for empty hash", () => {
      expect(verifyPassword("test", "")).toBe(false);
    });

    test("returns false for partial hash", () => {
      expect(verifyPassword("test", "100000:salt")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Hash Verification
  // ---------------------------------------------------------------------------
  describe("verifyHash", () => {
    test("verifies correct hash", () => {
      const data = "my-data";
      const hash = hashString(data);
      expect(verifyHash(data, hash)).toBe(true);
    });

    test("rejects incorrect hash", () => {
      expect(verifyHash("data", hashString("different-data"))).toBe(false);
    });

    test("returns false for malformed hash", () => {
      expect(verifyHash("data", "not-a-hex-hash")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Timed Tokens
  // ---------------------------------------------------------------------------
  describe("generateTimedToken / verifyTimedToken", () => {
    test("generates and verifies a valid token", () => {
      const token = generateTimedToken("my-payload", 60000); // 1 minute
      const result = verifyTimedToken(token);
      expect(result).toBe("my-payload");
    });

    test("returns null for expired token", () => {
      const token = generateTimedToken("expired-payload", -1000); // Already expired
      const result = verifyTimedToken(token);
      expect(result).toBeNull();
    });

    test("returns null for tampered token", () => {
      const token = generateTimedToken("payload", 60000);
      // Flip a character in the middle of the token to corrupt the signature
      const chars = token.split("");
      const midpoint = Math.floor(chars.length / 2);
      chars[midpoint] = chars[midpoint] === "A" ? "B" : "A";
      const tampered = chars.join("");
      const result = verifyTimedToken(tampered);
      expect(result).toBeNull();
    });

    test("returns null for empty string", () => {
      expect(verifyTimedToken("")).toBeNull();
    });

    test("returns null for random string", () => {
      expect(verifyTimedToken("not-a-valid-token")).toBeNull();
    });

    test("handles payload with colons", () => {
      const token = generateTimedToken("key:value:extra", 60000);
      const result = verifyTimedToken(token);
      expect(result).toBe("key:value:extra");
    });
  });

  // ---------------------------------------------------------------------------
  // Checksum
  // ---------------------------------------------------------------------------
  describe("calculateChecksum", () => {
    test("returns consistent checksum for same data", () => {
      const checksum1 = calculateChecksum("test-data");
      const checksum2 = calculateChecksum("test-data");
      expect(checksum1).toBe(checksum2);
    });

    test("returns 8 character hex string", () => {
      const checksum = calculateChecksum("data");
      expect(checksum.length).toBe(8);
      expect(/^[0-9a-f]+$/.test(checksum)).toBe(true);
    });

    test("different data produces different checksums", () => {
      const checksum1 = calculateChecksum("data-a");
      const checksum2 = calculateChecksum("data-b");
      expect(checksum1).not.toBe(checksum2);
    });

    test("works with Buffer input", () => {
      const checksum = calculateChecksum(Buffer.from("test"));
      expect(checksum.length).toBe(8);
    });
  });

  describe("verifyChecksum", () => {
    test("verifies correct checksum", () => {
      const data = "important-data";
      const checksum = calculateChecksum(data);
      expect(verifyChecksum(data, checksum)).toBe(true);
    });

    test("rejects incorrect checksum", () => {
      expect(verifyChecksum("data", "00000000")).toBe(false);
    });

    test("works with Buffer input", () => {
      const buf = Buffer.from("test-data");
      const checksum = calculateChecksum(buf);
      expect(verifyChecksum(buf, checksum)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Encoding
  // ---------------------------------------------------------------------------
  describe("toBase64 / fromBase64", () => {
    test("encodes and decodes string", () => {
      const original = "Hello, World!";
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);
      expect(decoded).toBe(original);
    });

    test("encodes empty string", () => {
      const encoded = toBase64("");
      const decoded = fromBase64(encoded);
      expect(decoded).toBe("");
    });

    test("encodes special characters", () => {
      const original = "Special chars: !@#$%^&*()";
      const decoded = fromBase64(toBase64(original));
      expect(decoded).toBe(original);
    });

    test("works with Buffer input", () => {
      const buf = Buffer.from("buffer-data");
      const encoded = toBase64(buf);
      const decoded = fromBase64(encoded);
      expect(decoded).toBe("buffer-data");
    });
  });

  describe("toBase64Url / fromBase64Url", () => {
    test("encodes and decodes string", () => {
      const original = "Hello, World!";
      const encoded = toBase64Url(original);
      const decoded = fromBase64Url(encoded);
      expect(decoded).toBe(original);
    });

    test("produces URL-safe output", () => {
      // Use data that would produce +, /, or = in standard base64
      const data = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa]);
      const encoded = toBase64Url(data);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
    });

    test("encodes empty string", () => {
      const encoded = toBase64Url("");
      const decoded = fromBase64Url(encoded);
      expect(decoded).toBe("");
    });
  });
});
