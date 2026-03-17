/**
 * Portal Service
 *
 * Manages multi-portal access and navigation.
 * Handles Admin, Manager, and Employee Self-Service portals.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  PortalType,
  Portal,
  UserPortalAccess,
} from "./portal.schemas";

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId: string;
}

interface PortalRow {
  id: string;
  code: PortalType;
  name: string;
  description: string | null;
  base_path: string;
  is_active: boolean;
  icon: string | null;
}

interface UserPortalAccessRow {
  portal_id: string;
  portal_code: PortalType;
  portal_name: string;
  base_path: string;
  is_default: boolean;
  icon: string | null;
}

// =============================================================================
// Portal Service
// =============================================================================

export class PortalService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get all available portals in the system
   */
  async getAllPortals(ctx: TenantContext): Promise<Portal[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PortalRow[]>`
        SELECT id, code, name, description, base_path, is_active, icon
        FROM app.portals
        ORDER BY name
      `;
    });

    return rows.map(this.mapPortalRow);
  }

  /**
   * Get active portals
   */
  async getActivePortals(ctx: TenantContext): Promise<Portal[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PortalRow[]>`
        SELECT id, code, name, description, base_path, is_active, icon
        FROM app.portals
        WHERE is_active = true
        ORDER BY name
      `;
    });

    return rows.map(this.mapPortalRow);
  }

  /**
   * Get portal by code
   */
  async getPortalByCode(ctx: TenantContext, code: PortalType): Promise<Portal | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PortalRow[]>`
        SELECT id, code, name, description, base_path, is_active, icon
        FROM app.portals
        WHERE code = ${code}
      `;
    });

    return rows.length > 0 ? this.mapPortalRow(rows[0]) : null;
  }

  /**
   * Get user's available portals
   */
  async getUserPortals(ctx: TenantContext): Promise<UserPortalAccess[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<UserPortalAccessRow[]>`
        SELECT * FROM app.get_user_portals(${ctx.userId}::uuid)
      `;
    });

    return rows.map((row) => ({
      portalId: row.portal_id,
      portalCode: row.portal_code,
      portalName: row.portal_name,
      basePath: row.base_path,
      isDefault: row.is_default,
      icon: row.icon,
    }));
  }

  /**
   * Get user's default portal
   */
  async getUserDefaultPortal(
    ctx: TenantContext
  ): Promise<UserPortalAccess | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<UserPortalAccessRow[]>`
        SELECT * FROM app.get_user_default_portal(${ctx.userId}::uuid)
      `;
    });

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      portalId: row.portal_id,
      portalCode: row.portal_code,
      portalName: row.portal_name,
      basePath: row.base_path,
      isDefault: true,
      icon: row.icon,
    };
  }

  /**
   * Check if user has access to a specific portal
   */
  async hasPortalAccess(
    ctx: TenantContext,
    portalCode: PortalType
  ): Promise<boolean> {
    const portals = await this.getUserPortals(ctx);
    return portals.some((p) => p.portalCode === portalCode);
  }

  /**
   * Grant portal access to a user
   */
  async grantPortalAccess(
    ctx: TenantContext,
    targetUserId: string,
    portalCode: PortalType,
    isDefault: boolean = false
  ): Promise<string> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ access_id: string }[]>`
        SELECT app.grant_portal_access(
          ${targetUserId}::uuid,
          ${portalCode}::app.portal_type,
          ${isDefault},
          ${ctx.userId}::uuid
        ) as access_id
      `;
      return rows[0]?.access_id;
    });

    return result;
  }

  /**
   * Revoke portal access from a user
   */
  async revokePortalAccess(
    ctx: TenantContext,
    targetUserId: string,
    portalCode: PortalType
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ result: boolean }[]>`
        SELECT app.revoke_portal_access(
          ${targetUserId}::uuid,
          ${portalCode}::app.portal_type,
          ${ctx.userId}::uuid
        ) as result
      `;
      return rows[0]?.result ?? false;
    });

    return result;
  }

  /**
   * Set user's default portal
   */
  async setDefaultPortal(
    ctx: TenantContext,
    portalCode: PortalType
  ): Promise<void> {
    await this.db.withTransaction(ctx, async (tx) => {
      // First check if user has access to this portal
      const accessCheck = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.user_portal_access upa
          JOIN app.portals p ON p.id = upa.portal_id
          WHERE upa.user_id = ${ctx.userId}::uuid
            AND upa.tenant_id = ${ctx.tenantId}::uuid
            AND p.code = ${portalCode}::app.portal_type
            AND upa.is_active = true
            AND upa.revoked_at IS NULL
        ) as exists
      `;

      if (accessCheck[0]?.exists !== true) {
        throw new PortalAccessError(
          `User does not have access to portal: ${portalCode}`
        );
      }

      // Clear all defaults for this user
      await tx`
        UPDATE app.user_portal_access
        SET is_default = false
        WHERE user_id = ${ctx.userId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
      `;

      // Set the new default
      await tx`
        UPDATE app.user_portal_access upa
        SET is_default = true
        FROM app.portals p
        WHERE upa.portal_id = p.id
          AND upa.user_id = ${ctx.userId}::uuid
          AND upa.tenant_id = ${ctx.tenantId}::uuid
          AND p.code = ${portalCode}::app.portal_type
      `;
    });
  }

  /**
   * Get portal navigation menu structure
   */
  async getPortalNavigation(
    ctx: TenantContext,
    portalCode: PortalType
  ): Promise<PortalNavigationItem[]> {
    // Navigation is defined statically per portal type
    // In a more advanced system, this could be database-driven
    switch (portalCode) {
      case "admin":
        return this.getAdminNavigation();
      case "manager":
        return this.getManagerNavigation();
      case "employee":
        return this.getEmployeeNavigation();
      default:
        return [];
    }
  }

  /**
   * Auto-assign portal access based on roles
   */
  async syncPortalAccessFromRoles(
    ctx: TenantContext,
    targetUserId: string
  ): Promise<void> {
    await this.db.withTransaction(ctx, async (tx) => {
      // Get user's roles and their portal types
      const roles = await tx<{ portal_type: PortalType | null }[]>`
        SELECT DISTINCT r.portal_type
        FROM app.role_assignments ra
        JOIN app.roles r ON r.id = ra.role_id
        WHERE ra.user_id = ${targetUserId}::uuid
          AND ra.tenant_id = ${ctx.tenantId}::uuid
          AND r.portal_type IS NOT NULL
      `;

      // Get portals
      const portals = await tx<{ id: string; code: PortalType }[]>`
        SELECT id, code FROM app.portals WHERE is_active = true
      `;

      const portalMap = new Map(portals.map((p) => [p.code, p.id]));

      // Grant access for each portal type the user has roles for (batch insert)
      const portalAccessRows = roles
        .filter(role => role.portal_type && portalMap.has(role.portal_type))
        .map(role => ({
          tenant_id: ctx.tenantId,
          user_id: targetUserId,
          portal_id: portalMap.get(role.portal_type!)!,
          granted_by: ctx.userId,
        }));

      if (portalAccessRows.length > 0) {
        await tx`
          INSERT INTO app.user_portal_access ${(tx as any)(portalAccessRows)}
          ON CONFLICT (tenant_id, user_id, portal_id) DO NOTHING
        `;
      }
    });
  }

  // =============================================================================
  // Private Navigation Helpers
  // =============================================================================

  private getAdminNavigation(): PortalNavigationItem[] {
    return [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/admin/dashboard",
        icon: "home",
      },
      {
        id: "people",
        label: "People",
        icon: "users",
        children: [
          { id: "employees", label: "Employees", path: "/admin/people/employees" },
          { id: "positions", label: "Positions", path: "/admin/people/positions" },
          { id: "contracts", label: "Contracts", path: "/admin/people/contracts" },
          { id: "new-starter", label: "New Starter", path: "/admin/people/new-starter" },
          { id: "leaver", label: "Leaver Processing", path: "/admin/people/leaver" },
        ],
      },
      {
        id: "organisation",
        label: "Organisation",
        icon: "building",
        children: [
          { id: "org-structure", label: "Org Structure", path: "/admin/organisation/structure" },
          { id: "departments", label: "Departments", path: "/admin/organisation/departments" },
          { id: "locations", label: "Locations", path: "/admin/organisation/locations" },
          { id: "cost-centres", label: "Cost Centres", path: "/admin/organisation/cost-centres" },
        ],
      },
      {
        id: "time-attendance",
        label: "Time & Attendance",
        icon: "clock",
        children: [
          { id: "absence", label: "Absence Management", path: "/admin/time/absence" },
          { id: "leave-policies", label: "Leave Policies", path: "/admin/time/policies" },
          { id: "timesheets", label: "Timesheets", path: "/admin/time/timesheets" },
          { id: "schedules", label: "Schedules", path: "/admin/time/schedules" },
        ],
      },
      {
        id: "talent",
        label: "Talent",
        icon: "star",
        children: [
          { id: "recruitment", label: "Recruitment", path: "/admin/talent/recruitment" },
          { id: "onboarding", label: "Onboarding", path: "/admin/talent/onboarding" },
          { id: "performance", label: "Performance", path: "/admin/talent/performance" },
          { id: "learning", label: "Learning", path: "/admin/talent/learning" },
          { id: "succession", label: "Succession", path: "/admin/talent/succession" },
        ],
      },
      {
        id: "system",
        label: "System",
        icon: "settings",
        children: [
          { id: "users", label: "Users", path: "/admin/system/users" },
          { id: "roles", label: "Roles & Permissions", path: "/admin/system/roles" },
          { id: "field-security", label: "Field Security", path: "/admin/system/field-security" },
          { id: "workflows", label: "Workflows", path: "/admin/system/workflows" },
          { id: "audit-log", label: "Audit Log", path: "/admin/system/audit" },
          { id: "settings", label: "Settings", path: "/admin/system/settings" },
        ],
      },
      {
        id: "reports",
        label: "Reports",
        path: "/admin/reports",
        icon: "bar-chart",
      },
    ];
  }

  private getManagerNavigation(): PortalNavigationItem[] {
    return [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/manager/dashboard",
        icon: "home",
      },
      {
        id: "team",
        label: "My Team",
        path: "/manager/team",
        icon: "users",
      },
      {
        id: "approvals",
        label: "Approvals",
        path: "/manager/approvals",
        icon: "check-circle",
      },
      {
        id: "absence",
        label: "Team Absence",
        icon: "calendar",
        children: [
          { id: "calendar", label: "Team Calendar", path: "/manager/absence/calendar" },
          { id: "balances", label: "Leave Balances", path: "/manager/absence/balances" },
          { id: "requests", label: "Leave Requests", path: "/manager/absence/requests" },
        ],
      },
      {
        id: "performance",
        label: "Performance",
        icon: "trending-up",
        children: [
          { id: "reviews", label: "Team Reviews", path: "/manager/performance/reviews" },
          { id: "goals", label: "Team Goals", path: "/manager/performance/goals" },
          { id: "one-on-ones", label: "1:1 Notes", path: "/manager/performance/one-on-ones" },
        ],
      },
      {
        id: "reports",
        label: "Team Reports",
        path: "/manager/reports",
        icon: "bar-chart",
      },
    ];
  }

  private getEmployeeNavigation(): PortalNavigationItem[] {
    return [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/ess/dashboard",
        icon: "home",
      },
      {
        id: "profile",
        label: "My Profile",
        path: "/ess/profile",
        icon: "user",
      },
      {
        id: "pay",
        label: "My Pay",
        icon: "credit-card",
        children: [
          { id: "payslips", label: "Payslips", path: "/ess/pay/payslips" },
          { id: "tax-docs", label: "Tax Documents", path: "/ess/pay/tax-documents" },
          { id: "bank-details", label: "Bank Details", path: "/ess/pay/bank-details" },
        ],
      },
      {
        id: "time",
        label: "Time Off",
        icon: "calendar",
        children: [
          { id: "balances", label: "My Balances", path: "/ess/time/balances" },
          { id: "request", label: "Request Leave", path: "/ess/time/request" },
          { id: "history", label: "Leave History", path: "/ess/time/history" },
          { id: "team-calendar", label: "Team Calendar", path: "/ess/time/team-calendar" },
        ],
      },
      {
        id: "documents",
        label: "Documents",
        path: "/ess/documents",
        icon: "file-text",
      },
      {
        id: "learning",
        label: "Learning",
        icon: "book",
        children: [
          { id: "my-training", label: "My Training", path: "/ess/learning/training" },
          { id: "courses", label: "Available Courses", path: "/ess/learning/courses" },
          { id: "certifications", label: "Certifications", path: "/ess/learning/certifications" },
        ],
      },
      {
        id: "performance",
        label: "Performance",
        icon: "target",
        children: [
          { id: "goals", label: "My Goals", path: "/ess/performance/goals" },
          { id: "reviews", label: "My Reviews", path: "/ess/performance/reviews" },
          { id: "development", label: "Development Plan", path: "/ess/performance/development" },
        ],
      },
      {
        id: "company",
        label: "Company",
        icon: "building",
        children: [
          { id: "directory", label: "Directory", path: "/ess/company/directory" },
          { id: "org-chart", label: "Org Chart", path: "/ess/company/org-chart" },
          { id: "policies", label: "Policies", path: "/ess/company/policies" },
        ],
      },
    ];
  }

  private mapPortalRow(row: PortalRow): Portal {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      basePath: row.base_path,
      isActive: row.is_active,
      icon: row.icon,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

export interface PortalNavigationItem {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  children?: PortalNavigationItem[];
}

// =============================================================================
// Custom Errors
// =============================================================================

export class PortalAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalAccessError";
  }
}
