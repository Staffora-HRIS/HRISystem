/**
 * URL Safety Utilities
 *
 * Prevents open redirect vulnerabilities by validating that redirect
 * targets are safe, same-origin paths rather than absolute URLs to
 * external domains.
 */

/**
 * Check whether a URL string is a safe same-origin redirect path.
 *
 * A safe redirect path:
 * - Starts with a single forward slash (relative path)
 * - Does NOT start with "//" (protocol-relative URL, e.g. "//evil.com")
 * - Does NOT contain a backslash after the leading slash (e.g. "/\evil.com"
 *   which some browsers normalise to "//evil.com")
 *
 * @example
 * isSafeRedirectPath("/dashboard")        // true
 * isSafeRedirectPath("/settings/profile") // true
 * isSafeRedirectPath("https://evil.com")  // false
 * isSafeRedirectPath("//evil.com")        // false
 * isSafeRedirectPath("/\\evil.com")       // false
 * isSafeRedirectPath("")                  // false
 */
export function isSafeRedirectPath(url: string): boolean {
  if (!url || !url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.length > 1 && url[1] === "\\") return false;
  return true;
}
