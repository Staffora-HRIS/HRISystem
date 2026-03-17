/**
 * Lookup Values Module
 *
 * Tenant-configurable lookup categories and values for dropdown/enum fields.
 * Replaces hard-coded PostgreSQL enums with flexible, per-tenant configuration.
 */

export { lookupValuesRoutes, type LookupValuesRoutes } from "./routes";
export { LookupValuesService } from "./service";
export { LookupValuesRepository } from "./repository";
export * from "./schemas";
