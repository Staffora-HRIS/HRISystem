/**
 * Employee Change Requests Module
 *
 * Provides employee self-service change request workflow:
 * - Portal routes for employees to submit/view/cancel change requests
 * - Admin routes for HR/managers to review (approve/reject) change requests
 */

export { changeRequestPortalRoutes, changeRequestAdminRoutes } from "./routes";
export { ChangeRequestRepository } from "./repository";
export { ChangeRequestService } from "./service";
