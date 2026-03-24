/**
 * IP Allowlist Plugin
 *
 * Restricts access to admin endpoints based on client IP address.
 * Reads a comma-separated list of allowed IPs/CIDRs from the
 * ADMIN_IP_ALLOWLIST environment variable. When the variable is not set
 * or empty, enforcement is skipped and all IPs are allowed.
 *
 * Only routes whose path starts with /api/v1/admin or /api/v1/system
 * are checked. All other routes pass through without restriction.
 */

import { Elysia } from "elysia";
import { createErrorResponse, ErrorCodes } from "./errors";
import { getClientIp } from "../lib/client-ip";

// =============================================================================
// Types
// =============================================================================

export interface IpAllowlistPluginOptions {
  /** Comma-separated IPs/CIDRs to allow. Defaults to ADMIN_IP_ALLOWLIST env var. */
  allowlist?: string;
  /** Route prefixes to protect. Defaults to admin and system routes. */
  protectedPrefixes?: string[];
  /** Enable or disable the plugin. Defaults to true when allowlist is non-empty. */
  enabled?: boolean;
}

// =============================================================================
// CIDR Matching
// =============================================================================

/**
 * Parse an IPv4 address into a 32-bit integer.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isFinite(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // ensure unsigned 32-bit
}

/**
 * Check whether an IP matches a given CIDR range or exact IP.
 * Supports plain IPs (e.g. "10.0.0.1") and CIDR notation (e.g. "10.0.0.0/24").
 */
function matchesCidr(ip: string, cidr: string): boolean {
  const [cidrIp, prefixStr] = cidr.split("/");
  if (!cidrIp) return false;

  const ipInt = ipv4ToInt(ip);
  const cidrInt = ipv4ToInt(cidrIp);
  if (ipInt === null || cidrInt === null) {
    // Fall back to exact string match for IPv6 or non-standard formats
    return ip === cidrIp;
  }

  if (prefixStr === undefined) {
    // Exact IP match (no CIDR prefix)
    return ipInt === cidrInt;
  }

  const prefix = Number(prefixStr);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;

  if (prefix === 0) return true; // /0 matches everything
  const mask = (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (cidrInt & mask);
}

// =============================================================================
// Plugin
// =============================================================================

const DEFAULT_PROTECTED_PREFIXES = [
  "/api/v1/admin",
  "/api/v1/system",
  "/api/v1/feature-flags/admin",
];

export function ipAllowlistPlugin(options: IpAllowlistPluginOptions = {}) {
  const rawAllowlist = options.allowlist ?? process.env["ADMIN_IP_ALLOWLIST"] ?? "";
  const entries = rawAllowlist
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const protectedPrefixes = options.protectedPrefixes ?? DEFAULT_PROTECTED_PREFIXES;

  const isTestRun =
    process.env["NODE_ENV"] === "test" ||
    process.env["BUN_TEST"] === "true" ||
    process.argv.includes("test");

  // Determine if the plugin is enabled
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : !isTestRun && entries.length > 0;

  if (!enabled || entries.length === 0) {
    return new Elysia({ name: "ip-allowlist" });
  }

  console.log(
    `[IpAllowlist] Enforcing admin IP allowlist with ${entries.length} entries for prefixes: ${protectedPrefixes.join(", ")}`
  );

  return new Elysia({ name: "ip-allowlist" }).onBeforeHandle(
    { as: "global" },
    (ctx) => {
      const { request, path, set } = ctx as any;
      const requestId =
        typeof (ctx as any).requestId === "string" && (ctx as any).requestId
          ? (ctx as any).requestId
          : `req_${Date.now().toString(36)}`;

      // Only check protected route prefixes
      const isProtected = protectedPrefixes.some((prefix) => path.startsWith(prefix));
      if (!isProtected) return;

      // Resolve client IP
      const overrideIp = (ctx as any)._clientIp as string | undefined;
      const socketIp =
        overrideIp ??
        ((ctx as any).server?.requestIP?.(request)?.address as string | undefined);
      const clientIp = getClientIp(request, socketIp) ?? "unknown";

      // Check if the IP is in the allowlist
      const allowed = entries.some((entry) => matchesCidr(clientIp, entry));

      if (!allowed) {
        console.warn(
          `[IpAllowlist] Blocked request from IP ${clientIp} to ${request.method} ${path}`
        );
        set.status = 403;
        return createErrorResponse(
          ErrorCodes.FORBIDDEN,
          "IP not allowed",
          requestId,
        );
      }
    }
  );
}
