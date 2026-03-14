/**
 * Startup Secret Validation
 *
 * Validates that all required secrets are set and meet minimum security
 * requirements. Crashes the process with a clear error message if any
 * secret is missing, too short, or matches a known insecure default.
 *
 * Called at application startup in app.ts.
 */

import { logger } from "../lib/logger";

/** Known insecure default values that must not be used in production */
const INSECURE_DEFAULTS = [
  "change-me",
  "change-me-use-openssl-rand-base64-32",
  "development-secret-change-in-production",
  "dev_session_secret_32chars_min",
  "dev_csrf_secret_32chars_min",
  "dev_better_auth_secret_32chars",
  "secret",
  "password",
  "12345",
];

interface SecretRule {
  envVar: string;
  minLength: number;
  required: boolean;
  description: string;
}

const SECRET_RULES: SecretRule[] = [
  {
    envVar: "BETTER_AUTH_SECRET",
    minLength: 32,
    required: true,
    description: "Better Auth session encryption secret",
  },
  {
    envVar: "SESSION_SECRET",
    minLength: 32,
    required: false, // Falls back to BETTER_AUTH_SECRET
    description: "Session signing secret",
  },
  {
    envVar: "CSRF_SECRET",
    minLength: 32,
    required: false,
    description: "CSRF protection secret",
  },
];

/**
 * Validate all required secrets at startup.
 * In production, exits the process on failure.
 * In development, logs warnings but allows startup.
 */
export function validateSecrets(): void {
  const isProduction = process.env["NODE_ENV"] === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of SECRET_RULES) {
    const value = process.env[rule.envVar];

    if (!value) {
      if (rule.required) {
        errors.push(
          `${rule.envVar} is not set. ${rule.description}. Generate with: openssl rand -base64 32`
        );
      }
      continue;
    }

    if (value.length < rule.minLength) {
      const msg = `${rule.envVar} is too short (${value.length} chars, minimum ${rule.minLength}). Generate with: openssl rand -base64 32`;
      if (isProduction) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }

    const lowerValue = value.toLowerCase();
    if (INSECURE_DEFAULTS.some((d) => lowerValue.includes(d))) {
      const msg = `${rule.envVar} contains an insecure default value. Generate a real secret with: openssl rand -base64 32`;
      if (isProduction) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // Log warnings in development
  for (const warning of warnings) {
    logger.warn({ warning }, "security warning");
  }

  // In production, crash on any error
  if (errors.length > 0 && isProduction) {
    logger.fatal({ errors }, "secret validation failed in production");
    process.exit(1);
  }
}
