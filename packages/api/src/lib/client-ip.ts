/**
 * Shared Client IP Resolution Utility
 *
 * Extracts the real client IP from incoming requests by checking trusted proxy
 * headers (X-Forwarded-For, X-Real-IP) only when the direct connection comes
 * from a known/trusted proxy. This prevents IP spoofing via forged headers.
 *
 * Configuration:
 * - TRUSTED_PROXIES env var: comma-separated list of trusted proxy IPs/CIDRs.
 *   When empty or unset, proxy headers are ignored and only the socket IP is used.
 */

// =============================================================================
// Trusted Proxy Configuration
// =============================================================================

/**
 * Trusted proxy IPs loaded from environment.
 * Only trust X-Forwarded-For / X-Real-IP when the direct socket connection
 * originates from one of these addresses.
 *
 * Override via TRUSTED_PROXIES env var (comma-separated IPs/CIDRs).
 * When empty/unset, proxy headers are ignored and the socket IP is used.
 */
export const TRUSTED_PROXIES: string[] = process.env["TRUSTED_PROXIES"]
  ? process.env["TRUSTED_PROXIES"].split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// =============================================================================
// Functions
// =============================================================================

/**
 * Check whether a given IP is in the trusted proxy list.
 * Uses simple exact-match; extend with CIDR matching if needed.
 */
export function isTrustedProxy(ip: string): boolean {
  if (TRUSTED_PROXIES.length === 0) return false;
  return TRUSTED_PROXIES.includes(ip);
}

/**
 * Resolve the real client IP from a request.
 *
 * When `socketIp` is provided and belongs to a trusted proxy, the function
 * inspects X-Forwarded-For (rightmost untrusted IP) and X-Real-IP headers.
 * Otherwise it falls back to the raw socket IP.
 *
 * @param request  - The incoming HTTP request (used to read headers)
 * @param socketIp - The IP of the direct TCP connection (from the server runtime)
 * @returns The resolved client IP, or null if it cannot be determined
 */
export function getClientIp(request: Request, socketIp?: string): string | null {
  // Only trust proxy headers when running behind a known reverse proxy
  if (socketIp && isTrustedProxy(socketIp)) {
    const forwarded = request.headers.get("X-Forwarded-For");
    if (forwarded) {
      // Take the rightmost IP not in the trusted set (last hop before our proxy)
      const ips = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!isTrustedProxy(ips[i]!)) {
          return ips[i]!;
        }
      }
    }

    const realIp = request.headers.get("X-Real-IP");
    if (realIp) return realIp;
  }

  // Fall back to socket IP (direct connection or no trusted proxies configured)
  return socketIp || null;
}
