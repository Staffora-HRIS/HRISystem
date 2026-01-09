/**
 * HRIS Platform Shared Package
 *
 * This package contains shared types, constants, utilities,
 * schemas, error handling, and state machines used across
 * the API and Web packages.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================
// Re-export all type definitions
export * from "./types";

// =============================================================================
// Constants
// =============================================================================
// Re-export all constants
export * from "./constants";

// =============================================================================
// Utilities
// =============================================================================
// Re-export all utility functions
export * from "./utils";

// =============================================================================
// Errors
// =============================================================================
// Re-export error codes, messages, and utilities
export * from "./errors";

// =============================================================================
// Schemas
// =============================================================================
// Re-export TypeBox schemas for API validation
export * from "./schemas";

// =============================================================================
// State Machines
// =============================================================================
// Re-export state machines for business logic
export * from "./state-machines";
