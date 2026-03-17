/**
 * Job Boards Module
 *
 * Exports for job board integration module
 */

export { jobBoardRoutes, type JobBoardRoutes } from "./routes";
export { JobBoardsService, SUPPORTED_BOARDS } from "./service";
export { JobBoardsRepository, type JobBoardPosting } from "./repository";
export * from "./schemas";
