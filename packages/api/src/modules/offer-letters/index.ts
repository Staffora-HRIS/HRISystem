/**
 * Offer Letters Module
 *
 * Manages offer letter lifecycle for recruitment:
 *   1. Create offer letter (from template or raw HTML)
 *   2. Update draft offer letter
 *   3. Send offer letter to candidate
 *   4. Candidate accepts or declines
 *
 * State machine: draft -> sent -> accepted/declined/expired
 */

export { offerLetterRoutes, type OfferLetterRoutes } from "./routes";
export { OfferLetterService } from "./service";
export { OfferLetterRepository } from "./repository";
export * from "./schemas";
