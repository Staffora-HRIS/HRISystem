/**
 * Virus Scanning Service
 *
 * Connects to ClamAV via its TCP protocol (clamd) and scans file buffers
 * for malware before they are stored. Implements graceful degradation:
 * if ClamAV is unavailable, uploads proceed with a logged warning.
 *
 * Protocol Reference:
 *   - INSTREAM command: sends file data in chunks, ClamAV responds with
 *     "stream: OK" or "stream: <virus-name> FOUND"
 *   - Chunk format: 4-byte big-endian length prefix + data, terminated
 *     by a zero-length chunk (4 zero bytes)
 *
 * Environment Variables:
 *   - CLAMAV_HOST (default: "localhost")
 *   - CLAMAV_PORT (default: 3310)
 *   - CLAMAV_TIMEOUT (default: 30000ms)
 *   - CLAMAV_ENABLED (default: "false") - set to "true" to enforce scanning
 */

import { logger } from "./logger";
import * as net from "net";

// =============================================================================
// Types
// =============================================================================

export interface VirusScanResult {
  /** Whether the scan completed (even if ClamAV was unavailable in degraded mode) */
  scanned: boolean;
  /** Whether the file is clean (true) or infected (false) */
  clean: boolean;
  /** Name of the virus if detected, null otherwise */
  virusName: string | null;
  /** Whether the scan ran in degraded mode (ClamAV unavailable) */
  degraded: boolean;
  /** Error message if scan failed (only set in degraded mode) */
  error?: string;
}

export interface VirusScanConfig {
  host: string;
  port: number;
  timeoutMs: number;
  enabled: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Build ClamAV configuration from environment variables.
 */
export function getVirusScanConfig(): VirusScanConfig {
  return {
    host: process.env["CLAMAV_HOST"] || "localhost",
    port: parseInt(process.env["CLAMAV_PORT"] || "3310", 10),
    timeoutMs: parseInt(process.env["CLAMAV_TIMEOUT"] || "30000", 10),
    enabled: (process.env["CLAMAV_ENABLED"] || "false").toLowerCase() === "true",
  };
}

// =============================================================================
// ClamAV Client
// =============================================================================

/**
 * Maximum chunk size for INSTREAM protocol (ClamAV default StreamMaxLength is 25MB).
 * We send in 8KB chunks to avoid memory pressure.
 */
const CHUNK_SIZE = 8192;

/**
 * Scan a file buffer using ClamAV's INSTREAM command.
 *
 * Protocol:
 * 1. Send "zINSTREAM\0" to start streaming mode
 * 2. Send chunks: [4-byte big-endian length][data]
 * 3. Send terminator: [4 zero bytes]
 * 4. Read response: "stream: OK\0" or "stream: <name> FOUND\0"
 *
 * @param buffer - The file content to scan
 * @param config - Optional configuration override (defaults to env-based config)
 * @returns VirusScanResult indicating scan outcome
 */
export async function scanBuffer(
  buffer: Buffer,
  config?: VirusScanConfig
): Promise<VirusScanResult> {
  const cfg = config || getVirusScanConfig();
  const scanLogger = logger.child({ component: "virus-scan" });

  // If scanning is disabled, skip entirely
  if (!cfg.enabled) {
    scanLogger.debug("Virus scanning is disabled (CLAMAV_ENABLED=false), skipping scan");
    return {
      scanned: false,
      clean: true,
      virusName: null,
      degraded: true,
      error: "Virus scanning is disabled",
    };
  }

  try {
    const response = await sendToClam(buffer, cfg);
    const trimmedResponse = response.trim().replace(/\0/g, "");

    // ClamAV response format: "stream: OK" or "stream: <virus-name> FOUND"
    if (trimmedResponse.endsWith("OK")) {
      scanLogger.info(
        { fileSize: buffer.length },
        "File passed virus scan"
      );
      return {
        scanned: true,
        clean: true,
        virusName: null,
        degraded: false,
      };
    }

    if (trimmedResponse.endsWith("FOUND")) {
      // Extract virus name: "stream: Win.Test.EICAR_HDB-1 FOUND" -> "Win.Test.EICAR_HDB-1"
      const match = trimmedResponse.match(/^stream:\s*(.+)\s+FOUND$/);
      const virusName = match ? match[1]!.trim() : "Unknown";

      scanLogger.warn(
        { fileSize: buffer.length, virusName },
        "Virus detected in uploaded file"
      );
      return {
        scanned: true,
        clean: false,
        virusName,
        degraded: false,
      };
    }

    // Unexpected response -- treat as error, enter degraded mode
    scanLogger.error(
      { response: trimmedResponse },
      "Unexpected ClamAV response, allowing upload in degraded mode"
    );
    return {
      scanned: false,
      clean: true,
      virusName: null,
      degraded: true,
      error: `Unexpected ClamAV response: ${trimmedResponse}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scanLogger.warn(
      { error: message },
      "ClamAV unavailable, allowing upload in degraded mode"
    );
    return {
      scanned: false,
      clean: true,
      virusName: null,
      degraded: true,
      error: `ClamAV connection failed: ${message}`,
    };
  }
}

/**
 * Send a buffer to ClamAV via TCP using the INSTREAM protocol.
 *
 * @param buffer - The file content to scan
 * @param config - ClamAV connection configuration
 * @returns The raw response string from ClamAV
 */
function sendToClam(buffer: Buffer, config: VirusScanConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    // Set connection timeout
    socket.setTimeout(config.timeoutMs);

    socket.on("timeout", () => {
      settle(() => {
        socket.destroy();
        reject(new Error(`ClamAV connection timed out after ${config.timeoutMs}ms`));
      });
    });

    socket.on("error", (err) => {
      settle(() => {
        socket.destroy();
        reject(err);
      });
    });

    socket.on("data", (data) => {
      response += data.toString("utf-8");
    });

    socket.on("end", () => {
      settle(() => {
        resolve(response);
      });
    });

    socket.connect(config.port, config.host, () => {
      // Send INSTREAM command (null-terminated)
      socket.write("zINSTREAM\0");

      // Send file data in chunks.
      //
      // SECURITY NOTE (CodeQL js/file-access-to-http, alert #50 — false positive):
      // Streaming the file buffer to a TCP socket is the explicit purpose of this
      // function: ClamAV's INSTREAM protocol requires the file content to be
      // transmitted to the daemon for malware inspection. The destination
      // (config.host / config.port) is sourced exclusively from the
      // CLAMAV_HOST / CLAMAV_PORT environment variables via getVirusScanConfig()
      // and is never influenced by request data or user input. ClamAV is an
      // admin-operated, trusted internal service. This alert is dismissed via
      // the GitHub API after merge.
      let offset = 0;
      while (offset < buffer.length) {
        const end = Math.min(offset + CHUNK_SIZE, buffer.length);
        const chunk = buffer.subarray(offset, end);
        const lengthPrefix = Buffer.alloc(4);
        lengthPrefix.writeUInt32BE(chunk.length, 0);
        socket.write(lengthPrefix);
        socket.write(chunk);
        offset = end;
      }

      // Send zero-length terminator
      const terminator = Buffer.alloc(4, 0);
      socket.write(terminator);
    });
  });
}

/**
 * Ping ClamAV to check if it is reachable and responding.
 * Sends the PING command and expects "PONG" in response.
 *
 * @param config - Optional configuration override
 * @returns true if ClamAV responded with PONG, false otherwise
 */
export async function pingClamAV(config?: VirusScanConfig): Promise<boolean> {
  const cfg = config || getVirusScanConfig();

  if (!cfg.enabled) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (result: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(5000);
    socket.on("timeout", () => settle(false));
    socket.on("error", () => settle(false));

    socket.on("data", (data) => {
      const response = data.toString("utf-8").trim().replace(/\0/g, "");
      settle(response === "PONG");
    });

    socket.connect(cfg.port, cfg.host, () => {
      socket.write("zPING\0");
    });
  });
}

/**
 * Get ClamAV version information for health checks.
 *
 * @param config - Optional configuration override
 * @returns Version string or null if unavailable
 */
export async function getClamAVVersion(config?: VirusScanConfig): Promise<string | null> {
  const cfg = config || getVirusScanConfig();

  if (!cfg.enabled) {
    return null;
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let response = "";
    let settled = false;

    const settle = (result: string | null) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(5000);
    socket.on("timeout", () => settle(null));
    socket.on("error", () => settle(null));
    socket.on("data", (data) => {
      response += data.toString("utf-8");
    });
    socket.on("end", () => {
      settle(response.trim().replace(/\0/g, "") || null);
    });

    socket.connect(cfg.port, cfg.host, () => {
      socket.write("zVERSION\0");
    });
  });
}
