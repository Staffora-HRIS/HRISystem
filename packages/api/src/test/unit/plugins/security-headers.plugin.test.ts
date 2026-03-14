/**
 * Security Headers Plugin Unit Tests
 *
 * Tests the security headers plugin which provides:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options (DENY or SAMEORIGIN)
 * - X-XSS-Protection
 * - Content-Security-Policy (CSP)
 * - Referrer-Policy
 * - Permissions-Policy
 * - Strict-Transport-Security (HSTS)
 * - Cross-Origin policies
 * - Custom headers
 * - Configuration presets (API-only, web app)
 */

import { describe, it, expect } from "bun:test";
import { Elysia } from "elysia";
import {
  securityHeadersPlugin,
  apiSecurityHeaders,
  webAppSecurityHeaders,
} from "../../../plugins/security-headers";
import type { SecurityHeadersOptions, ContentSecurityPolicy } from "../../../plugins/security-headers";

// =============================================================================
// Helper to get all security headers from a response
// =============================================================================

async function getHeaders(options?: SecurityHeadersOptions): Promise<Headers> {
  const app = new Elysia()
    .use(securityHeadersPlugin(options))
    .get("/test", () => ({ ok: true }));
  const res = await app.handle(new Request("http://localhost/test"));
  return res.headers;
}

// =============================================================================
// Default Security Headers
// =============================================================================

describe("securityHeadersPlugin - defaults", () => {
  it("should set X-Content-Type-Options to nosniff", async () => {
    const headers = await getHeaders();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("should set X-Frame-Options to DENY by default", async () => {
    const headers = await getHeaders();
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("should set X-XSS-Protection to '1; mode=block'", async () => {
    const headers = await getHeaders();
    expect(headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("should set Referrer-Policy to strict-origin-when-cross-origin", async () => {
    const headers = await getHeaders();
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("should set X-Download-Options to noopen", async () => {
    const headers = await getHeaders();
    expect(headers.get("X-Download-Options")).toBe("noopen");
  });

  it("should set X-Permitted-Cross-Domain-Policies to none", async () => {
    const headers = await getHeaders();
    expect(headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
  });

  it("should set Cross-Origin-Opener-Policy to same-origin", async () => {
    const headers = await getHeaders();
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("should set Cross-Origin-Resource-Policy to same-origin", async () => {
    const headers = await getHeaders();
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("should include a default Content-Security-Policy", async () => {
    const headers = await getHeaders();
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("should include a Permissions-Policy", async () => {
    const headers = await getHeaders();
    const pp = headers.get("Permissions-Policy");
    expect(pp).toBeTruthy();
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("interest-cohort=()");
  });

  it("should NOT include HSTS header by default in non-production", async () => {
    const headers = await getHeaders();
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });
});

// =============================================================================
// Disabled Plugin
// =============================================================================

describe("securityHeadersPlugin - disabled", () => {
  it("should not set any security headers when disabled", async () => {
    const headers = await getHeaders({ enabled: false });
    expect(headers.get("X-Content-Type-Options")).toBeNull();
    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("Content-Security-Policy")).toBeNull();
  });
});

// =============================================================================
// Custom Configuration
// =============================================================================

describe("securityHeadersPlugin - custom options", () => {
  it("should allow SAMEORIGIN for X-Frame-Options", async () => {
    const headers = await getHeaders({ frameOptions: "SAMEORIGIN" });
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("should allow custom Referrer-Policy", async () => {
    const headers = await getHeaders({ referrerPolicy: "no-referrer" });
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("should set HSTS header when enableHSTS is true", async () => {
    const headers = await getHeaders({ enableHSTS: true });
    const hsts = headers.get("Strict-Transport-Security");
    expect(hsts).toBeTruthy();
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });

  it("should support custom HSTS max-age", async () => {
    const headers = await getHeaders({ enableHSTS: true, hstsMaxAge: 86400 });
    const hsts = headers.get("Strict-Transport-Security");
    expect(hsts).toContain("max-age=86400");
  });

  it("should support HSTS preload", async () => {
    const headers = await getHeaders({ enableHSTS: true, hstsPreload: true });
    const hsts = headers.get("Strict-Transport-Security");
    expect(hsts).toContain("preload");
  });

  it("should support disabling includeSubDomains in HSTS", async () => {
    const headers = await getHeaders({
      enableHSTS: true,
      hstsIncludeSubDomains: false,
    });
    const hsts = headers.get("Strict-Transport-Security");
    expect(hsts).not.toContain("includeSubDomains");
  });

  it("should support custom CSP directives", async () => {
    const csp: ContentSecurityPolicy = {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'", "https://cdn.example.com"],
      imgSrc: ["'self'", "https://img.example.com"],
      frameAncestors: ["'none'"],
    };
    const headers = await getHeaders({ csp });
    const cspHeader = headers.get("Content-Security-Policy");
    expect(cspHeader).toContain("default-src 'none'");
    expect(cspHeader).toContain("script-src 'self' https://cdn.example.com");
    expect(cspHeader).toContain("img-src 'self' https://img.example.com");
  });

  it("should support CSP report-uri", async () => {
    const csp: ContentSecurityPolicy = {
      defaultSrc: ["'self'"],
      reportUri: "https://csp.example.com/report",
    };
    const headers = await getHeaders({ csp });
    const cspHeader = headers.get("Content-Security-Policy");
    expect(cspHeader).toContain("report-uri https://csp.example.com/report");
  });

  it("should support CSP report-to", async () => {
    const csp: ContentSecurityPolicy = {
      defaultSrc: ["'self'"],
      reportTo: "csp-endpoint",
    };
    const headers = await getHeaders({ csp });
    const cspHeader = headers.get("Content-Security-Policy");
    expect(cspHeader).toContain("report-to csp-endpoint");
  });

  it("should support blockAllMixedContent CSP directive", async () => {
    const csp: ContentSecurityPolicy = {
      defaultSrc: ["'self'"],
      blockAllMixedContent: true,
    };
    const headers = await getHeaders({ csp });
    const cspHeader = headers.get("Content-Security-Policy");
    expect(cspHeader).toContain("block-all-mixed-content");
  });

  it("should support all CSP directive types", async () => {
    const csp: ContentSecurityPolicy = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'"],
      childSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    };
    const headers = await getHeaders({ csp });
    const cspHeader = headers.get("Content-Security-Policy")!;
    expect(cspHeader).toContain("media-src 'self'");
    expect(cspHeader).toContain("worker-src 'self'");
    expect(cspHeader).toContain("child-src 'self'");
    expect(cspHeader).toContain("font-src 'self'");
    expect(cspHeader).toContain("connect-src 'self'");
    expect(cspHeader).toContain("frame-src 'self'");
  });

  it("should support custom Permissions-Policy", async () => {
    const headers = await getHeaders({
      permissionsPolicy: {
        camera: ["self"],
        microphone: [],
      },
    });
    const pp = headers.get("Permissions-Policy");
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=()");
  });

  it("should support custom headers", async () => {
    const headers = await getHeaders({
      customHeaders: {
        "X-Custom-Header": "custom-value",
        "X-Another": "another-value",
      },
    });
    expect(headers.get("X-Custom-Header")).toBe("custom-value");
    expect(headers.get("X-Another")).toBe("another-value");
  });
});

// =============================================================================
// Presets
// =============================================================================

describe("apiSecurityHeaders preset", () => {
  it("should set restrictive CSP for API-only mode", async () => {
    const preset = apiSecurityHeaders();
    const headers = await getHeaders(preset);
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("should use no-referrer policy for API mode", async () => {
    const preset = apiSecurityHeaders();
    const headers = await getHeaders(preset);
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("should set X-Frame-Options to DENY", async () => {
    const preset = apiSecurityHeaders();
    const headers = await getHeaders(preset);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});

describe("webAppSecurityHeaders preset", () => {
  it("should set SAMEORIGIN for X-Frame-Options", async () => {
    const preset = webAppSecurityHeaders();
    const headers = await getHeaders(preset);
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("should include allowed origins in CSP connect-src", async () => {
    const preset = webAppSecurityHeaders(["https://api.example.com"]);
    const headers = await getHeaders(preset);
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });

  it("should use strict-origin-when-cross-origin referrer policy", async () => {
    const preset = webAppSecurityHeaders();
    const headers = await getHeaders(preset);
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});

// =============================================================================
// Global application
// =============================================================================

describe("securityHeadersPlugin applies to all routes", () => {
  it("should set security headers on multiple routes", async () => {
    const app = new Elysia()
      .use(securityHeadersPlugin())
      .get("/a", () => "a")
      .get("/b", () => "b")
      .post("/c", () => "c");

    const resA = await app.handle(new Request("http://localhost/a"));
    const resB = await app.handle(new Request("http://localhost/b"));
    const resC = await app.handle(new Request("http://localhost/c", { method: "POST" }));

    expect(resA.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resB.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resC.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
