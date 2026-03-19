/**
 * Shift Swap Module
 *
 * Provides two-phase shift swap approval workflow:
 *   1. Requester creates swap request (pending_target)
 *   2. Target employee accepts (pending_manager) or rejects
 *   3. Manager approves (approved, shifts swapped) or rejects
 */

export { shiftSwapRoutes, type ShiftSwapRoutes } from "./routes";
export { ShiftSwapService, ShiftSwapErrorCodes } from "./service";
export { ShiftSwapRepository } from "./repository";
export * from "./schemas";
