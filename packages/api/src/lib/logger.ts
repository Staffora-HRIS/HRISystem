/**
 * Structured Logger Module
 *
 * Provides a pino-based structured logging solution for the Staffora API.
 * Features:
 * - JSON output in production, pretty-print in development
 * - Automatic redaction of sensitive fields (passwords, tokens, secrets)
 * - Child logger factory for request-scoped context (requestId, tenantId, userId)
 * - Log levels configurable via LOG_LEVEL env var
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env["LOG_LEVEL"] || (isProduction ? "info" : "debug");

/**
 * Root logger instance.
 *
 * In production: outputs structured JSON for log aggregation (ELK, Datadog, etc.)
 * In development: pretty-prints with colors and timestamps for readability.
 */
export const logger = pino({
  level,
  // JSON in production, pretty-print in development
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
  // Base fields included on every log line
  base: {
    service: "staffora-api",
    env: process.env["NODE_ENV"] || "development",
  },
  // Redact sensitive fields to prevent credential leakage
  redact: {
    paths: [
      "password",
      "secret",
      "token",
      "authorization",
      "cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.authorization",
      "*.cookie",
    ],
    censor: "[REDACTED]",
  },
});

/**
 * Create a child logger with request context.
 * Use this in route handlers and services to attach correlation data.
 *
 * @example
 * ```ts
 * const log = createRequestLogger({ requestId, tenantId, userId });
 * log.info({ employeeId }, "employee created");
 * ```
 */
export function createRequestLogger(context: {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
}) {
  return logger.child(context);
}

export type Logger = pino.Logger;
