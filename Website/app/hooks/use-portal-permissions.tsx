import { useMemo } from "react";
import { usePortalAuth, type PortalRole } from "~/hooks/use-portal-auth";

interface PortalPermissions {
  // Tickets
  canViewOwnTickets: boolean;
  canCreateTickets: boolean;
  canReplyToOwnTickets: boolean;
  canViewAllTickets: boolean;
  canAssignTickets: boolean;
  canChangeTicketStatus: boolean;
  canAddInternalNotes: boolean;
  // Documents
  canViewDocuments: boolean;
  canUploadDocuments: boolean;
  canManageDocuments: boolean;
  // News
  canViewNews: boolean;
  canCreateNews: boolean;
  // Billing
  canViewBilling: boolean;
  canManageBilling: boolean;
  // Users
  canManageUsers: boolean;
  canManageRoles: boolean;
  // Audit & System
  canViewAuditLog: boolean;
  canAccessSystemSettings: boolean;
  // Role shortcuts
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAgent: boolean;
}

const AGENT_ROLES: PortalRole[] = ["support_agent", "admin", "super_admin"];
const ADMIN_ROLES: PortalRole[] = ["admin", "super_admin"];

function hasRole(role: PortalRole, allowed: PortalRole[]): boolean {
  return allowed.includes(role);
}

export function usePortalPermissions(): PortalPermissions {
  const { user } = usePortalAuth();
  const role = user?.role || "client";

  return useMemo(
    () => ({
      // Tickets
      canViewOwnTickets: true,
      canCreateTickets: true,
      canReplyToOwnTickets: true,
      canViewAllTickets: hasRole(role, AGENT_ROLES),
      canAssignTickets: hasRole(role, AGENT_ROLES),
      canChangeTicketStatus: hasRole(role, AGENT_ROLES),
      canAddInternalNotes: hasRole(role, AGENT_ROLES),
      // Documents
      canViewDocuments: true,
      canUploadDocuments: hasRole(role, ADMIN_ROLES),
      canManageDocuments: hasRole(role, ADMIN_ROLES),
      // News
      canViewNews: true,
      canCreateNews: hasRole(role, ADMIN_ROLES),
      // Billing
      canViewBilling:
        role === "client" || hasRole(role, ADMIN_ROLES),
      canManageBilling: role === "super_admin",
      // Users
      canManageUsers: hasRole(role, ADMIN_ROLES),
      canManageRoles: role === "super_admin",
      // Audit & System
      canViewAuditLog: hasRole(role, ADMIN_ROLES),
      canAccessSystemSettings: role === "super_admin",
      // Role shortcuts
      isAdmin: hasRole(role, ADMIN_ROLES),
      isSuperAdmin: role === "super_admin",
      isAgent: hasRole(role, AGENT_ROLES),
    }),
    [role],
  );
}
