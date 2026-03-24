/**
 * Manager Service (Facade)
 *
 * Composes the focused sub-services into a single facade for backwards
 * compatibility. Routes and external consumers can continue to use
 * `new ManagerService(db)` without modification.
 *
 * Sub-services:
 *   - ManagerHierarchyService  -- employee lookup, subordinate traversal
 *   - ManagerApprovalService   -- approve/reject workflows
 *   - ManagerAbsenceService    -- team overview, absence calendar
 *
 * New code should import from the sub-service files directly for
 * reduced coupling and better testability.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TeamMemberSummary, TeamOverview, ApprovalType, PendingApproval } from "./manager.schemas";
import { ManagerHierarchyService } from "./manager.hierarchy.service";
import { ManagerApprovalService } from "./manager.approval.service";
import { ManagerAbsenceService } from "./manager.absence.service";

// Re-export types and errors from the shared types module
export { ManagerAccessError } from "./manager.types";
export type { TenantContext, TeamAbsenceEntry } from "./manager.types";

// =============================================================================
// Manager Service (Facade)
// =============================================================================

export class ManagerService {
  private hierarchy: ManagerHierarchyService;
  private approval: ManagerApprovalService;
  private absence: ManagerAbsenceService;

  constructor(private db: DatabaseClient) {
    this.hierarchy = new ManagerHierarchyService(db);
    this.approval = new ManagerApprovalService(db, this.hierarchy);
    this.absence = new ManagerAbsenceService(db, this.hierarchy);
  }

  // ===========================================================================
  // Hierarchy Delegation
  // ===========================================================================

  async getCurrentEmployeeId(ctx: { tenantId: string; userId: string }): Promise<string | null> {
    return this.hierarchy.getCurrentEmployeeId(ctx);
  }

  async isManager(ctx: { tenantId: string; userId: string }): Promise<boolean> {
    return this.hierarchy.isManager(ctx);
  }

  async getDirectReports(ctx: { tenantId: string; userId: string }): Promise<TeamMemberSummary[]> {
    return this.hierarchy.getDirectReports(ctx);
  }

  async getAllSubordinates(
    ctx: { tenantId: string; userId: string },
    maxDepth: number = 10
  ): Promise<TeamMemberSummary[]> {
    return this.hierarchy.getAllSubordinates(ctx, maxDepth);
  }

  async getTeamMember(
    ctx: { tenantId: string; userId: string },
    employeeId: string
  ): Promise<TeamMemberSummary | null> {
    return this.hierarchy.getTeamMember(ctx, employeeId);
  }

  async isSubordinateOf(
    ctx: { tenantId: string; userId: string },
    employeeId: string
  ): Promise<boolean> {
    return this.hierarchy.isSubordinateOf(ctx, employeeId);
  }

  // ===========================================================================
  // Approval Delegation
  // ===========================================================================

  async getPendingApprovals(
    ctx: { tenantId: string; userId: string },
    type?: ApprovalType
  ): Promise<PendingApproval[]> {
    return this.approval.getPendingApprovals(ctx, type);
  }

  async approveRequest(
    ctx: { tenantId: string; userId: string },
    requestId: string,
    type: ApprovalType,
    comment?: string
  ): Promise<void> {
    return this.approval.approveRequest(ctx, requestId, type, comment);
  }

  async rejectRequest(
    ctx: { tenantId: string; userId: string },
    requestId: string,
    type: ApprovalType,
    comment?: string
  ): Promise<void> {
    return this.approval.rejectRequest(ctx, requestId, type, comment);
  }

  async bulkApproveRequests(
    ctx: { tenantId: string; userId: string },
    items: Array<{
      type: "leave_request" | "timesheet";
      id: string;
      action: "approve" | "reject";
      notes?: string;
    }>
  ): Promise<{ approved: string[]; failed: Array<{ id: string; reason: string }> }> {
    return this.approval.bulkApproveRequests(ctx, items);
  }

  // ===========================================================================
  // Absence / Overview Delegation
  // ===========================================================================

  async getTeamOverview(ctx: { tenantId: string; userId: string }): Promise<TeamOverview> {
    return this.absence.getTeamOverview(ctx);
  }

  async getTeamAbsenceCalendar(
    ctx: { tenantId: string; userId: string },
    startDate: string,
    endDate: string
  ): Promise<import("./manager.types").TeamAbsenceEntry[]> {
    return this.absence.getTeamAbsenceCalendar(ctx, startDate, endDate);
  }

  /**
   * Get training overview for all direct reports (TODO).
   */
  async getTeamTrainingOverview(
    _ctx: { tenantId: string; userId: string },
    _filter: string = "all"
  ): Promise<any[]> {
    return [];
  }

  /**
   * Get detailed training status for a specific team member (TODO).
   */
  async getTeamMemberTraining(
    _ctx: { tenantId: string; userId: string },
    _employeeId: string
  ): Promise<any | null> {
    return null;
  }
}
