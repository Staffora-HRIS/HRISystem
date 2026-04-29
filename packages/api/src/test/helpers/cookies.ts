/**
 * Shared cookie helper utilities for integration tests.
 *
 * Extracts session cookies from HTTP responses for use in subsequent
 * authenticated requests.
 */

/**
 * Split a combined Set-Cookie header value into individual cookie strings.
 * Handles the ambiguity of commas in cookie values vs. separators.
 */
export function splitCombinedSetCookieHeader(value: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "," || value[i + 1] !== " ") continue;

    const rest = value.slice(i + 2);
    const boundary = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+=/.test(rest);
    if (!boundary) continue;

    out.push(value.slice(start, i));
    start = i + 2;
  }

  out.push(value.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Build a Cookie header string from a Response's Set-Cookie headers.
 * Strips attributes (Path, HttpOnly, etc.) and joins name=value pairs.
 */
export function buildCookieHeader(response: Response): string {
  const headersObj = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  let setCookies: string[];

  if (typeof headersObj.getSetCookie === "function") {
    setCookies = headersObj.getSetCookie();
  } else {
    const raw = response.headers.get("Set-Cookie") ?? "";
    setCookies = raw ? splitCombinedSetCookieHeader(raw) : [];
  }

  return setCookies
    .map((cookie) => cookie.split(";")[0] ?? cookie)
    .filter(Boolean)
    .join("; ");
}
