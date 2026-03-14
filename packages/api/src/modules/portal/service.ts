/**
 * Portal Module - Service Layer
 *
 * Business logic for the self-service portal aggregation endpoints.
 * Coordinates across portal repository methods and maps responses.
 */

import { PortalRepository, type TenantContext } from "./repository";

export class PortalService {
  constructor(private repository: PortalRepository) {}

  // ===========================================================================
  // Profile
  // ===========================================================================

  async getMyProfile(ctx: TenantContext, user: any, tenant: any) {
    const userName = typeof user.name === "string" ? user.name : null;
    const nameParts = userName ? userName.split(" ").filter(Boolean) : [];
    const fallbackFirstName = nameParts[0] ?? null;
    const fallbackLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

    const employee = await this.repository.getEmployeeProfile(ctx);

    if (!employee) {
      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: fallbackFirstName,
          lastName: fallbackLastName,
        },
        employee: null,
        tenant: { id: tenant.id, name: tenant.name },
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: employee.firstName ?? fallbackFirstName,
        lastName: employee.lastName ?? fallbackLastName,
      },
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        positionTitle: employee.positionTitle,
        orgUnitName: employee.orgUnitName,
        status: employee.status,
        hireDate: employee.hireDate,
      },
      tenant: { id: tenant.id, name: tenant.name },
    };
  }

  // ===========================================================================
  // Team
  // ===========================================================================

  async getMyTeam(ctx: TenantContext) {
    const team = await this.repository.getDirectReports(ctx);

    return {
      team: team.map((m: any) => ({
        id: m.id,
        employeeNumber: m.employeeNumber,
        firstName: m.firstName,
        lastName: m.lastName,
        positionTitle: m.positionTitle,
        status: m.status,
      })),
      count: team.length,
    };
  }

  // ===========================================================================
  // Tasks
  // ===========================================================================

  async getMyTasks(ctx: TenantContext) {
    const tasks = await this.repository.getPendingTasks(ctx);

    return {
      tasks: tasks.map((t: any) => ({
        id: t.id,
        taskType: t.taskType,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
        createdAt: t.createdAt,
      })),
      count: tasks.length,
    };
  }

  // ===========================================================================
  // Approvals
  // ===========================================================================

  async getMyApprovals(ctx: TenantContext) {
    const [leaveApprovals, timesheetApprovals] = await Promise.all([
      this.repository.getPendingLeaveApprovals(ctx),
      this.repository.getPendingTimesheetApprovals(ctx),
    ]);

    return {
      approvals: [
        ...leaveApprovals.map((a: any) => ({
          id: a.id,
          type: "leave_request",
          employeeId: a.employeeId,
          employeeName: `${a.firstName} ${a.lastName}`,
          details: {
            leaveType: a.leaveType,
            startDate: a.startDate,
            endDate: a.endDate,
            totalDays: a.totalDays,
            reason: a.reason,
          },
          createdAt: a.createdAt,
        })),
        ...timesheetApprovals.map((a: any) => ({
          id: a.id,
          type: "timesheet",
          employeeId: a.employeeId,
          employeeName: `${a.firstName} ${a.lastName}`,
          details: {
            periodStart: a.periodStart,
            periodEnd: a.periodEnd,
            totalHours: a.totalRegularHours,
          },
          createdAt: a.submittedAt,
        })),
      ],
      count: leaveApprovals.length + timesheetApprovals.length,
    };
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  async getDashboardSummary(ctx: TenantContext) {
    const [pendingTasks, pendingApprovals, teamMembers] = await Promise.all([
      this.repository.getPendingTaskCount(ctx),
      this.repository.getPendingApprovalCount(ctx),
      this.repository.getTeamMemberCount(ctx),
    ]);

    return {
      summary: {
        pendingTasks,
        pendingApprovals,
        teamMembers,
      },
    };
  }

  // ===========================================================================
  // Employee Directory
  // ===========================================================================

  async searchDirectory(
    ctx: TenantContext,
    filters: { search?: string; departmentId?: string; locationId?: string },
    pagination: { cursor?: string; limit?: number }
  ) {
    const result = await this.repository.searchEmployeeDirectory(ctx, filters, pagination);

    return {
      employees: result.items.map((e: any) => ({
        id: e.id,
        employeeNumber: e.employeeNumber ?? e.employee_number,
        firstName: e.firstName ?? e.first_name,
        lastName: e.lastName ?? e.last_name,
        preferredName: e.preferredName ?? e.preferred_name ?? null,
        positionTitle: e.positionTitle ?? e.position_title ?? null,
        departmentId: e.departmentId ?? e.department_id ?? null,
        departmentName: e.departmentName ?? e.department_name ?? null,
        workEmail: e.workEmail ?? e.work_email ?? null,
        workPhone: e.workPhone ?? e.work_phone ?? null,
        startDate: e.startDate ?? e.start_date ?? null,
      })),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getDepartments(ctx: TenantContext) {
    const departments = await this.repository.getDepartmentList(ctx);

    return {
      departments: departments.map((d: any) => ({
        id: d.id,
        name: d.name,
        employeeCount: d.employeeCount ?? d.employee_count ?? 0,
      })),
    };
  }

  // ===========================================================================
  // Portal Access & Navigation
  // ===========================================================================

  async getAvailablePortals(ctx: TenantContext) {
    const [roles, hasDirectReports] = await Promise.all([
      this.repository.getUserRoles(ctx),
      this.repository.hasDirectReports(ctx),
    ]);

    const portals: Array<{
      portalId: string;
      portalCode: string;
      portalName: string;
      basePath: string;
      isDefault: boolean;
      icon: string | null;
    }> = [];

    // All authenticated users get employee self-service
    portals.push({
      portalId: "employee",
      portalCode: "employee",
      portalName: "Employee Self-Service",
      basePath: "/ess",
      isDefault: false,
      icon: "user",
    });

    // Managers get manager portal
    if (hasDirectReports) {
      portals.push({
        portalId: "manager",
        portalCode: "manager",
        portalName: "Manager Portal",
        basePath: "/manager",
        isDefault: false,
        icon: "users",
      });
    }

    // Users with admin roles get admin portal
    const adminRoles = roles.filter((r: any) =>
      r.roleName?.toLowerCase().includes("admin") ||
      r.roleName?.toLowerCase().includes("hr")
    );
    if (adminRoles.length > 0) {
      portals.push({
        portalId: "admin",
        portalCode: "admin",
        portalName: "Admin Portal",
        basePath: "/admin",
        isDefault: true,
        icon: "settings",
      });
    }

    // If no portal is marked default, set the first one
    if (portals.length > 0 && !portals.some(p => p.isDefault)) {
      portals[0].isDefault = true;
    }

    return portals;
  }

  getPortalNavigation(_ctx: TenantContext, portalCode: string) {
    const navigationMap: Record<string, Array<{
      id: string;
      label: string;
      path?: string;
      icon?: string;
      children?: Array<{ id: string; label: string; path: string; icon?: string }>;
    }>> = {
      admin: [
        { id: "dashboard", label: "Dashboard", path: "/admin/dashboard", icon: "home" },
        { id: "hr", label: "HR", icon: "users", children: [
          { id: "employees", label: "Employees", path: "/admin/hr/employees" },
          { id: "positions", label: "Positions", path: "/admin/hr/positions" },
          { id: "contracts", label: "Contracts", path: "/admin/hr/contracts" },
        ]},
        { id: "time", label: "Time & Attendance", path: "/admin/time", icon: "clock" },
        { id: "leave", label: "Leave", path: "/admin/leave", icon: "calendar" },
        { id: "talent", label: "Talent", path: "/admin/talent", icon: "star" },
        { id: "lms", label: "Learning", path: "/admin/lms", icon: "book" },
        { id: "recruitment", label: "Recruitment", path: "/admin/talent/recruitment", icon: "user-plus" },
        { id: "reports", label: "Reports", path: "/admin/reports", icon: "bar-chart" },
        { id: "settings", label: "Settings", path: "/admin/settings", icon: "settings" },
      ],
      manager: [
        { id: "dashboard", label: "Dashboard", path: "/manager/dashboard", icon: "home" },
        { id: "team", label: "My Team", path: "/manager/team", icon: "users" },
        { id: "approvals", label: "Approvals", path: "/manager/approvals", icon: "check-circle" },
      ],
      employee: [
        { id: "dashboard", label: "Dashboard", path: "/ess/dashboard", icon: "home" },
        { id: "profile", label: "My Profile", path: "/ess/profile", icon: "user" },
        { id: "leave", label: "My Leave", path: "/ess/leave", icon: "calendar" },
        { id: "time", label: "My Time", path: "/ess/time", icon: "clock" },
        { id: "learning", label: "My Learning", path: "/ess/learning", icon: "book" },
      ],
    };

    return navigationMap[portalCode] || [];
  }

  async switchPortal(ctx: TenantContext, portalCode: string) {
    // Verify user has access to the requested portal
    const portals = await this.getAvailablePortals(ctx);
    const target = portals.find(p => p.portalCode === portalCode);

    if (!target) {
      return { success: false, portal: null };
    }

    return {
      success: true,
      portal: {
        code: target.portalCode,
        name: target.portalName,
        basePath: target.basePath,
      },
    };
  }
}
