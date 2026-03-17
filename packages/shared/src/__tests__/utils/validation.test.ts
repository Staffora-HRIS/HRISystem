/**
 * Validation Utilities Tests
 */

import { describe, test, expect } from "bun:test";
import {
  isValidEmail,
  isValidUUID,
  isValidUUIDv4,
  isStrongPassword,
  sanitizeString,
  escapeHtml,
  unescapeHtml,
  isValidUrl,
  isValidPhone,
  isValidSlug,
  isValidEmployeeNumber,
  isValidNINO,
  isValidUKPostcode,
  truncate,
} from "../../utils/validation";

describe("Validation Utilities", () => {
  // ---------------------------------------------------------------------------
  // Email Validation
  // ---------------------------------------------------------------------------
  describe("isValidEmail", () => {
    test("accepts valid email addresses", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("first.last@domain.co.uk")).toBe(true);
      expect(isValidEmail("user+tag@example.com")).toBe(true);
      expect(isValidEmail("user@subdomain.example.com")).toBe(true);
    });

    test("rejects invalid email addresses", () => {
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("@domain.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });

    test("rejects null/undefined inputs", () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
    });

    test("rejects email exceeding 254 characters", () => {
      const longLocal = "a".repeat(250);
      expect(isValidEmail(`${longLocal}@example.com`)).toBe(false);
    });

    test("rejects non-string inputs", () => {
      expect(isValidEmail(123 as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // UUID Validation
  // ---------------------------------------------------------------------------
  describe("isValidUUID", () => {
    test("accepts valid UUIDs", () => {
      expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
    });

    test("accepts UUIDs in any case", () => {
      expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    });

    test("rejects invalid UUIDs", () => {
      expect(isValidUUID("not-a-uuid")).toBe(false);
      expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
      expect(isValidUUID("")).toBe(false);
      expect(isValidUUID("12345678-1234-1234-1234-12345678901g")).toBe(false);
    });

    test("rejects null/undefined", () => {
      expect(isValidUUID(null as unknown as string)).toBe(false);
      expect(isValidUUID(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isValidUUIDv4", () => {
    test("accepts valid UUID v4", () => {
      expect(isValidUUIDv4("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    test("rejects UUID with wrong version number", () => {
      // Version 1 UUID (has '1' in the version position)
      expect(isValidUUIDv4("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(false);
    });

    test("rejects non-UUID strings", () => {
      expect(isValidUUIDv4("not-a-uuid")).toBe(false);
      expect(isValidUUIDv4("")).toBe(false);
    });

    test("rejects null/undefined", () => {
      expect(isValidUUIDv4(null as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Password Validation
  // ---------------------------------------------------------------------------
  describe("isStrongPassword", () => {
    test("accepts a strong password", () => {
      const result = isStrongPassword("MyStr0ng!Pass");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBeGreaterThan(0);
    });

    test("rejects password too short", () => {
      const result = isStrongPassword("Ab1!");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters");
    });

    test("rejects password without uppercase", () => {
      const result = isStrongPassword("nouppercase1!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
    });

    test("rejects password without lowercase", () => {
      const result = isStrongPassword("NOLOWERCASE1!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
    });

    test("rejects password without number", () => {
      const result = isStrongPassword("NoNumbers!!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("number"))).toBe(true);
    });

    test("rejects password without special character", () => {
      const result = isStrongPassword("NoSpecial123");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("special"))).toBe(true);
    });

    test("rejects password exceeding max length", () => {
      const longPassword = "A".repeat(129) + "a1!";
      const result = isStrongPassword(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("no more than"))).toBe(true);
    });

    test("custom minLength option", () => {
      const result = isStrongPassword("Ab1!", { minLength: 4 });
      expect(result.isValid).toBe(true);
    });

    test("allows disabling requirements", () => {
      const result = isStrongPassword("simplepassword", {
        requireUppercase: false,
        requireNumber: false,
        requireSpecial: false,
      });
      expect(result.isValid).toBe(true);
    });

    test("returns strength score that increases with length", () => {
      const short = isStrongPassword("Ab1!efgh");
      const long = isStrongPassword("Ab1!efghijklmnop");
      expect(long.strength).toBeGreaterThan(short.strength);
    });

    test("strength is capped at 100", () => {
      const result = isStrongPassword("VeryStr0ng!P@ssword!!");
      expect(result.strength).toBeLessThanOrEqual(100);
    });

    test("handles null/undefined password", () => {
      const result = isStrongPassword(null as unknown as string);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password is required");
      expect(result.strength).toBe(0);
    });

    test("handles empty string", () => {
      const result = isStrongPassword("");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password is required");
    });
  });

  // ---------------------------------------------------------------------------
  // String Sanitization
  // ---------------------------------------------------------------------------
  describe("sanitizeString", () => {
    test("trims whitespace", () => {
      expect(sanitizeString("  hello  ")).toBe("hello");
    });

    test("removes null bytes", () => {
      expect(sanitizeString("hel\0lo")).toBe("hello");
    });

    test("removes control characters", () => {
      expect(sanitizeString("hello\x01world")).toBe("helloworld");
    });

    test("preserves newlines and tabs", () => {
      expect(sanitizeString("hello\nworld")).toBe("hello\nworld");
      expect(sanitizeString("hello\tworld")).toBe("hello\tworld");
    });

    test("handles empty string", () => {
      expect(sanitizeString("")).toBe("");
    });

    test("handles null/undefined", () => {
      expect(sanitizeString(null as unknown as string)).toBe("");
      expect(sanitizeString(undefined as unknown as string)).toBe("");
    });

    test("handles non-string input", () => {
      expect(sanitizeString(123 as unknown as string)).toBe("");
    });
  });

  describe("escapeHtml", () => {
    test("escapes HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;&#x2F;script&gt;"
      );
    });

    test("escapes ampersand", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
    });

    test("escapes double quotes", () => {
      expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
    });

    test("escapes backtick", () => {
      expect(escapeHtml("`hello`")).toBe("&#x60;hello&#x60;");
    });

    test("escapes equals sign", () => {
      expect(escapeHtml("a=b")).toBe("a&#x3D;b");
    });

    test("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    test("handles null/undefined", () => {
      expect(escapeHtml(null as unknown as string)).toBe("");
      expect(escapeHtml(undefined as unknown as string)).toBe("");
    });

    test("does not change safe strings", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });
  });

  describe("unescapeHtml", () => {
    test("unescapes HTML entities", () => {
      expect(unescapeHtml("&lt;div&gt;")).toBe("<div>");
    });

    test("roundtrips with escapeHtml", () => {
      const original = '<script>alert("xss")</script>';
      expect(unescapeHtml(escapeHtml(original))).toBe(original);
    });

    test("handles empty string", () => {
      expect(unescapeHtml("")).toBe("");
    });

    test("handles null/undefined", () => {
      expect(unescapeHtml(null as unknown as string)).toBe("");
    });

    test("handles strings with no entities", () => {
      expect(unescapeHtml("hello world")).toBe("hello world");
    });
  });

  // ---------------------------------------------------------------------------
  // URL Validation
  // ---------------------------------------------------------------------------
  describe("isValidUrl", () => {
    test("accepts valid HTTP URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
    });

    test("rejects non-URL strings", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });

    test("rejects non-HTTP protocols by default", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("javascript:alert(1)")).toBe(false);
    });

    test("allows custom protocols", () => {
      expect(
        isValidUrl("ftp://example.com", { allowedProtocols: ["ftp:"] })
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Phone Validation
  // ---------------------------------------------------------------------------
  describe("isValidPhone", () => {
    test("accepts valid international phone numbers", () => {
      expect(isValidPhone("+44 20 7946 0958")).toBe(true);
      expect(isValidPhone("+1 555-123-4567")).toBe(true);
      expect(isValidPhone("+447911123456")).toBe(true);
    });

    test("accepts phone without plus prefix", () => {
      expect(isValidPhone("44207946095")).toBe(true);
    });

    test("rejects too short", () => {
      expect(isValidPhone("12345")).toBe(false);
    });

    test("rejects too long", () => {
      expect(isValidPhone("+1234567890123456")).toBe(false);
    });

    test("rejects non-numeric", () => {
      expect(isValidPhone("not-a-phone")).toBe(false);
    });

    test("rejects empty/null", () => {
      expect(isValidPhone("")).toBe(false);
      expect(isValidPhone(null as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Slug Validation
  // ---------------------------------------------------------------------------
  describe("isValidSlug", () => {
    test("accepts valid slugs", () => {
      expect(isValidSlug("my-project")).toBe(true);
      expect(isValidSlug("hello-world-123")).toBe(true);
      expect(isValidSlug("ab")).toBe(true);
    });

    test("rejects slugs with uppercase", () => {
      expect(isValidSlug("My-Project")).toBe(false);
    });

    test("rejects slugs with underscores", () => {
      expect(isValidSlug("my_project")).toBe(false);
    });

    test("rejects slugs starting with hyphen", () => {
      expect(isValidSlug("-my-project")).toBe(false);
    });

    test("rejects slugs ending with hyphen", () => {
      expect(isValidSlug("my-project-")).toBe(false);
    });

    test("rejects slugs with consecutive hyphens", () => {
      expect(isValidSlug("my--project")).toBe(false);
    });

    test("rejects too short", () => {
      expect(isValidSlug("a")).toBe(false);
    });

    test("rejects too long", () => {
      expect(isValidSlug("a".repeat(101))).toBe(false);
    });

    test("rejects empty/null", () => {
      expect(isValidSlug("")).toBe(false);
      expect(isValidSlug(null as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Employee Number Validation
  // ---------------------------------------------------------------------------
  describe("isValidEmployeeNumber", () => {
    test("accepts valid employee numbers", () => {
      expect(isValidEmployeeNumber("EMP001")).toBe(true);
      expect(isValidEmployeeNumber("A1B2C3")).toBe(true);
      expect(isValidEmployeeNumber("12345")).toBe(true);
      expect(isValidEmployeeNumber("ABC")).toBe(true);
    });

    test("rejects too short", () => {
      expect(isValidEmployeeNumber("AB")).toBe(false);
    });

    test("rejects too long", () => {
      expect(isValidEmployeeNumber("A".repeat(21))).toBe(false);
    });

    test("rejects special characters with default pattern", () => {
      expect(isValidEmployeeNumber("EMP-001")).toBe(false);
      expect(isValidEmployeeNumber("EMP 001")).toBe(false);
    });

    test("rejects empty/null", () => {
      expect(isValidEmployeeNumber("")).toBe(false);
      expect(isValidEmployeeNumber(null as unknown as string)).toBe(false);
    });

    test("allows custom pattern", () => {
      expect(isValidEmployeeNumber("EMP-001", /^EMP-\d{3}$/)).toBe(true);
      expect(isValidEmployeeNumber("EMP001", /^EMP-\d{3}$/)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // National Insurance Number (NINO) Validation
  // ---------------------------------------------------------------------------
  describe("isValidNINO", () => {
    test("accepts valid NINO without spaces", () => {
      expect(isValidNINO("AB123456C")).toBe(true);
    });

    test("accepts valid NINO with spaces", () => {
      expect(isValidNINO("AB 12 34 56 C")).toBe(true);
    });

    test("accepts valid NINO in lowercase", () => {
      expect(isValidNINO("ab123456c")).toBe(true);
    });

    test("accepts all valid suffix letters", () => {
      expect(isValidNINO("AB123456A")).toBe(true);
      expect(isValidNINO("AB123456B")).toBe(true);
      expect(isValidNINO("AB123456C")).toBe(true);
      expect(isValidNINO("AB123456D")).toBe(true);
    });

    test("rejects invalid prefixes (BG, GB, NK, KN, TN, NT, ZZ)", () => {
      expect(isValidNINO("BG123456A")).toBe(false);
      expect(isValidNINO("GB123456A")).toBe(false);
      expect(isValidNINO("NK123456A")).toBe(false);
      expect(isValidNINO("KN123456A")).toBe(false);
      expect(isValidNINO("TN123456A")).toBe(false);
      expect(isValidNINO("NT123456A")).toBe(false);
      expect(isValidNINO("ZZ123456A")).toBe(false);
    });

    test("rejects invalid first letter (D, F, I, Q, U, V)", () => {
      expect(isValidNINO("DA123456A")).toBe(false);
      expect(isValidNINO("FA123456A")).toBe(false);
      expect(isValidNINO("IA123456A")).toBe(false);
      expect(isValidNINO("QA123456A")).toBe(false);
      expect(isValidNINO("UA123456A")).toBe(false);
      expect(isValidNINO("VA123456A")).toBe(false);
    });

    test("rejects invalid suffix letter", () => {
      expect(isValidNINO("AB123456E")).toBe(false);
      expect(isValidNINO("AB123456Z")).toBe(false);
    });

    test("rejects wrong length", () => {
      expect(isValidNINO("AB12345C")).toBe(false);
      expect(isValidNINO("AB1234567C")).toBe(false);
    });

    test("rejects non-alphanumeric", () => {
      expect(isValidNINO("AB-12-34-56-C")).toBe(false);
    });

    test("rejects empty/null", () => {
      expect(isValidNINO("")).toBe(false);
      expect(isValidNINO(null as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // UK Postcode Validation
  // ---------------------------------------------------------------------------
  describe("isValidUKPostcode", () => {
    test("accepts valid UK postcodes with space", () => {
      expect(isValidUKPostcode("SW1A 1AA")).toBe(true);
      expect(isValidUKPostcode("EC1A 1BB")).toBe(true);
      expect(isValidUKPostcode("W1A 0AX")).toBe(true);
      expect(isValidUKPostcode("M1 1AE")).toBe(true);
      expect(isValidUKPostcode("B33 8TH")).toBe(true);
      expect(isValidUKPostcode("CR2 6XH")).toBe(true);
      expect(isValidUKPostcode("DN55 1PT")).toBe(true);
    });

    test("accepts valid UK postcodes without space", () => {
      expect(isValidUKPostcode("SW1A1AA")).toBe(true);
      expect(isValidUKPostcode("EC1A1BB")).toBe(true);
    });

    test("accepts lowercase postcodes", () => {
      expect(isValidUKPostcode("sw1a 1aa")).toBe(true);
    });

    test("accepts BFPO postcodes", () => {
      expect(isValidUKPostcode("BFPO1")).toBe(true);
      expect(isValidUKPostcode("BFPO1234")).toBe(true);
    });

    test("rejects US zip codes", () => {
      expect(isValidUKPostcode("12345")).toBe(false);
      expect(isValidUKPostcode("12345-6789")).toBe(false);
    });

    test("rejects invalid formats", () => {
      expect(isValidUKPostcode("INVALID")).toBe(false);
      expect(isValidUKPostcode("123 ABC")).toBe(false);
    });

    test("rejects empty/null", () => {
      expect(isValidUKPostcode("")).toBe(false);
      expect(isValidUKPostcode(null as unknown as string)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Truncation
  // ---------------------------------------------------------------------------
  describe("truncate", () => {
    test("does not truncate short strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    test("truncates long strings with ellipsis", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    test("uses custom suffix", () => {
      expect(truncate("hello world", 9, "--")).toBe("hello w--");
    });

    test("handles exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    test("handles empty string", () => {
      expect(truncate("", 10)).toBe("");
    });

    test("handles null/undefined", () => {
      expect(truncate(null as unknown as string, 10)).toBe("");
      expect(truncate(undefined as unknown as string, 10)).toBe("");
    });

    test("handles non-string input", () => {
      expect(truncate(123 as unknown as string, 10)).toBe("");
    });
  });
});
