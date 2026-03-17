/**
 * Background Checks Module
 *
 * External background check provider integration for DBS, credit,
 * employment history, education, and reference checks. TODO-194.
 */

export { backgroundCheckRoutes, type BackgroundCheckRoutes } from "./routes";
export { BackgroundCheckService } from "./service";
export { BackgroundCheckRepository } from "./repository";
export * from "./schemas";
