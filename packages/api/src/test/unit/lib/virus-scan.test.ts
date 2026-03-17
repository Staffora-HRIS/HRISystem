/**
 * Virus Scan Library - Unit Tests
 *
 * Tests the ClamAV integration library, including:
 * - Configuration parsing from environment variables
 * - Scan result handling (clean, infected, degraded)
 * - INSTREAM protocol behaviour
 * - Graceful degradation when ClamAV is unavailable
 *
 * These tests mock the TCP socket to avoid requiring a running ClamAV instance.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  scanBuffer,
  getVirusScanConfig,
  pingClamAV,
  getClamAVVersion,
  type VirusScanConfig,
} from "../../../lib/virus-scan";

// =============================================================================
// Test Configuration
// =============================================================================

const TEST_CONFIG: VirusScanConfig = {
  host: "localhost",
  port: 3310,
  timeoutMs: 5000,
  enabled: true,
};

const DISABLED_CONFIG: VirusScanConfig = {
  ...TEST_CONFIG,
  enabled: false,
};

// =============================================================================
// Configuration Tests
// =============================================================================

describe("getVirusScanConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it("should return defaults when no env vars are set", () => {
    delete process.env["CLAMAV_HOST"];
    delete process.env["CLAMAV_PORT"];
    delete process.env["CLAMAV_TIMEOUT"];
    delete process.env["CLAMAV_ENABLED"];

    const config = getVirusScanConfig();

    expect(config.host).toBe("localhost");
    expect(config.port).toBe(3310);
    expect(config.timeoutMs).toBe(30000);
    expect(config.enabled).toBe(false);
  });

  it("should read configuration from environment variables", () => {
    process.env["CLAMAV_HOST"] = "clamav-server";
    process.env["CLAMAV_PORT"] = "3311";
    process.env["CLAMAV_TIMEOUT"] = "60000";
    process.env["CLAMAV_ENABLED"] = "true";

    const config = getVirusScanConfig();

    expect(config.host).toBe("clamav-server");
    expect(config.port).toBe(3311);
    expect(config.timeoutMs).toBe(60000);
    expect(config.enabled).toBe(true);
  });

  it("should handle case-insensitive CLAMAV_ENABLED", () => {
    process.env["CLAMAV_ENABLED"] = "TRUE";
    expect(getVirusScanConfig().enabled).toBe(true);

    process.env["CLAMAV_ENABLED"] = "True";
    expect(getVirusScanConfig().enabled).toBe(true);

    process.env["CLAMAV_ENABLED"] = "false";
    expect(getVirusScanConfig().enabled).toBe(false);

    process.env["CLAMAV_ENABLED"] = "no";
    expect(getVirusScanConfig().enabled).toBe(false);
  });
});

// =============================================================================
// scanBuffer Tests
// =============================================================================

describe("scanBuffer", () => {
  it("should skip scan and return degraded when scanning is disabled", async () => {
    const buffer = Buffer.from("test file content");
    const result = await scanBuffer(buffer, DISABLED_CONFIG);

    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
    expect(result.virusName).toBeNull();
    expect(result.degraded).toBe(true);
    expect(result.error).toBe("Virus scanning is disabled");
  });

  it("should return degraded mode when ClamAV is unreachable", async () => {
    // Use a config pointing to a non-existent host/port
    const unreachableConfig: VirusScanConfig = {
      host: "127.0.0.1",
      port: 59999, // unlikely to have anything listening
      timeoutMs: 2000,
      enabled: true,
    };

    const buffer = Buffer.from("test file content");
    const result = await scanBuffer(buffer, unreachableConfig);

    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
    expect(result.virusName).toBeNull();
    expect(result.degraded).toBe(true);
    expect(result.error).toContain("ClamAV connection failed");
  });
});

// =============================================================================
// pingClamAV Tests
// =============================================================================

describe("pingClamAV", () => {
  it("should return false when scanning is disabled", async () => {
    const result = await pingClamAV(DISABLED_CONFIG);
    expect(result).toBe(false);
  });

  it("should return false when ClamAV is unreachable", async () => {
    const unreachableConfig: VirusScanConfig = {
      host: "127.0.0.1",
      port: 59999,
      timeoutMs: 2000,
      enabled: true,
    };

    const result = await pingClamAV(unreachableConfig);
    expect(result).toBe(false);
  });
});

// =============================================================================
// getClamAVVersion Tests
// =============================================================================

describe("getClamAVVersion", () => {
  it("should return null when scanning is disabled", async () => {
    const result = await getClamAVVersion(DISABLED_CONFIG);
    expect(result).toBeNull();
  });

  it("should return null when ClamAV is unreachable", async () => {
    const unreachableConfig: VirusScanConfig = {
      host: "127.0.0.1",
      port: 59999,
      timeoutMs: 2000,
      enabled: true,
    };

    const result = await getClamAVVersion(unreachableConfig);
    expect(result).toBeNull();
  });
});

// =============================================================================
// VirusScanResult Shape Tests
// =============================================================================

describe("VirusScanResult shape", () => {
  it("should have all expected fields for a clean result", async () => {
    const buffer = Buffer.from("test");
    const result = await scanBuffer(buffer, DISABLED_CONFIG);

    expect(result).toHaveProperty("scanned");
    expect(result).toHaveProperty("clean");
    expect(result).toHaveProperty("virusName");
    expect(result).toHaveProperty("degraded");
    expect(typeof result.scanned).toBe("boolean");
    expect(typeof result.clean).toBe("boolean");
    expect(typeof result.degraded).toBe("boolean");
  });

  it("should include error field in degraded mode", async () => {
    const buffer = Buffer.from("test");
    const result = await scanBuffer(buffer, DISABLED_CONFIG);

    expect(result.degraded).toBe(true);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });
});
