/**
 * Security Headers Plugin
 *
 * Adds comprehensive security headers to all responses for protection against:
 * - Clickjacking (X-Frame-Options)
 * - XSS attacks (Content-Security-Policy, X-XSS-Protection)
 * - MIME sniffing (X-Content-Type-Options)
 * - Referrer leakage (Referrer-Policy)
 * - HTTPS downgrade (Strict-Transport-Security)
 */

import { Elysia } from "elysia";

export interface SecurityHeadersOptions {
  /** Enable or disable security headers (default: true) */
  enabled?: boolean;
  /** Enable HSTS header - only enable in production with HTTPS (default: false) */
  enableHSTS?: boolean;
  /** HSTS max-age in seconds (default: 31536000 = 1 year) */
  hstsMaxAge?: number;
  /** Include subdomains in HSTS (default: true) */
  hstsIncludeSubDomains?: boolean;
  /** Enable HSTS preload (default: false) */
  hstsPreload?: boolean;
  /** Content-Security-Policy directives */
  csp?: ContentSecurityPolicy;
  /** X-Frame-Options value (default: "DENY") */
  frameOptions?: "DENY" | "SAMEORIGIN" | string;
  /** Referrer-Policy value (default: "strict-origin-when-cross-origin") */
  referrerPolicy?: string;
  /** Permissions-Policy directives */
  permissionsPolicy?: Record<string, string[]>;
  /** Custom headers to add */
  customHeaders?: Record<string, string>;
}

export interface ContentSecurityPolicy {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
  frameAncestors?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  workerSrc?: string[];
  childSrc?: string[];
  formAction?: string[];
  baseUri?: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
  reportUri?: string;
  reportTo?: string;
}

const DEFAULT_CSP: ContentSecurityPolicy = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  upgradeInsecureRequests: true,
};

const DEFAULT_PERMISSIONS_POLICY: Record<string, string[]> = {
  accelerometer: [],
  camera: [],
  geolocation: [],
  gyroscope: [],
  magnetometer: [],
  microphone: [],
  payment: [],
  usb: [],
  "interest-cohort": [], // Opt-out of FLoC
};

function buildCSPHeader(policy: ContentSecurityPolicy): string {
  const directives: string[] = [];

  if (policy.defaultSrc?.length) {
    directives.push(`default-src ${policy.defaultSrc.join(" ")}`);
  }
  if (policy.scriptSrc?.length) {
    directives.push(`script-src ${policy.scriptSrc.join(" ")}`);
  }
  if (policy.styleSrc?.length) {
    directives.push(`style-src ${policy.styleSrc.join(" ")}`);
  }
  if (policy.imgSrc?.length) {
    directives.push(`img-src ${policy.imgSrc.join(" ")}`);
  }
  if (policy.fontSrc?.length) {
    directives.push(`font-src ${policy.fontSrc.join(" ")}`);
  }
  if (policy.connectSrc?.length) {
    directives.push(`connect-src ${policy.connectSrc.join(" ")}`);
  }
  if (policy.frameSrc?.length) {
    directives.push(`frame-src ${policy.frameSrc.join(" ")}`);
  }
  if (policy.frameAncestors?.length) {
    directives.push(`frame-ancestors ${policy.frameAncestors.join(" ")}`);
  }
  if (policy.objectSrc?.length) {
    directives.push(`object-src ${policy.objectSrc.join(" ")}`);
  }
  if (policy.mediaSrc?.length) {
    directives.push(`media-src ${policy.mediaSrc.join(" ")}`);
  }
  if (policy.workerSrc?.length) {
    directives.push(`worker-src ${policy.workerSrc.join(" ")}`);
  }
  if (policy.childSrc?.length) {
    directives.push(`child-src ${policy.childSrc.join(" ")}`);
  }
  if (policy.formAction?.length) {
    directives.push(`form-action ${policy.formAction.join(" ")}`);
  }
  if (policy.baseUri?.length) {
    directives.push(`base-uri ${policy.baseUri.join(" ")}`);
  }
  if (policy.upgradeInsecureRequests) {
    directives.push("upgrade-insecure-requests");
  }
  if (policy.blockAllMixedContent) {
    directives.push("block-all-mixed-content");
  }
  if (policy.reportUri) {
    directives.push(`report-uri ${policy.reportUri}`);
  }
  if (policy.reportTo) {
    directives.push(`report-to ${policy.reportTo}`);
  }

  return directives.join("; ");
}

function buildPermissionsPolicyHeader(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([feature, allowlist]) => {
      if (allowlist.length === 0) {
        return `${feature}=()`;
      }
      return `${feature}=(${allowlist.join(" ")})`;
    })
    .join(", ");
}

function buildHSTSHeader(options: SecurityHeadersOptions): string {
  const maxAge = options.hstsMaxAge ?? 31536000;
  let header = `max-age=${maxAge}`;

  if (options.hstsIncludeSubDomains !== false) {
    header += "; includeSubDomains";
  }
  if (options.hstsPreload) {
    header += "; preload";
  }

  return header;
}

export function securityHeadersPlugin(options: SecurityHeadersOptions = {}) {
  const {
    enabled = true,
    enableHSTS = process.env["NODE_ENV"] === "production",
    frameOptions = "DENY",
    referrerPolicy = "strict-origin-when-cross-origin",
    csp = DEFAULT_CSP,
    permissionsPolicy = DEFAULT_PERMISSIONS_POLICY,
    customHeaders = {},
  } = options;

  if (!enabled) {
    return new Elysia({ name: "security-headers" });
  }

  // Pre-build headers for performance
  const cspHeader = buildCSPHeader(csp);
  const permissionsPolicyHeader = buildPermissionsPolicyHeader(permissionsPolicy);
  const hstsHeader = enableHSTS ? buildHSTSHeader(options) : null;

  return new Elysia({ name: "security-headers" }).onAfterHandle(
    { as: "global" },
    ({ set }) => {
      // Prevent MIME type sniffing
      set.headers["X-Content-Type-Options"] = "nosniff";

      // Prevent clickjacking
      set.headers["X-Frame-Options"] = frameOptions;

      // Legacy XSS protection (mostly obsolete, but harmless)
      set.headers["X-XSS-Protection"] = "1; mode=block";

      // Control referrer information
      set.headers["Referrer-Policy"] = referrerPolicy;

      // Content Security Policy
      if (cspHeader) {
        set.headers["Content-Security-Policy"] = cspHeader;
      }

      // Permissions Policy (replaces Feature-Policy)
      if (permissionsPolicyHeader) {
        set.headers["Permissions-Policy"] = permissionsPolicyHeader;
      }

      // HTTP Strict Transport Security (only in production with HTTPS)
      if (hstsHeader) {
        set.headers["Strict-Transport-Security"] = hstsHeader;
      }

      // Prevent IE from executing downloads in site's context
      set.headers["X-Download-Options"] = "noopen";

      // Prevent Adobe products from loading data
      set.headers["X-Permitted-Cross-Domain-Policies"] = "none";

      // Cross-Origin policies for modern browsers
      set.headers["Cross-Origin-Opener-Policy"] = "same-origin";
      set.headers["Cross-Origin-Resource-Policy"] = "same-origin";

      // Add custom headers
      for (const [key, value] of Object.entries(customHeaders)) {
        set.headers[key] = value;
      }
    }
  );
}

/**
 * Pre-configured security headers for API-only mode (no browser rendering)
 */
export function apiSecurityHeaders(): SecurityHeadersOptions {
  return {
    enabled: true,
    enableHSTS: process.env["NODE_ENV"] === "production",
    frameOptions: "DENY",
    referrerPolicy: "no-referrer",
    csp: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    permissionsPolicy: DEFAULT_PERMISSIONS_POLICY,
  };
}

/**
 * Pre-configured security headers for web apps served from same origin
 */
export function webAppSecurityHeaders(allowedOrigins: string[] = []): SecurityHeadersOptions {
  const connectSrc = ["'self'", ...allowedOrigins];

  return {
    enabled: true,
    enableHSTS: process.env["NODE_ENV"] === "production",
    frameOptions: "SAMEORIGIN",
    referrerPolicy: "strict-origin-when-cross-origin",
    csp: {
      ...DEFAULT_CSP,
      connectSrc,
    },
    permissionsPolicy: DEFAULT_PERMISSIONS_POLICY,
  };
}
