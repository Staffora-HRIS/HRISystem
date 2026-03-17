/**
 * Audit Logging Plugin
 *
 * Provides audit logging capabilities for tracking changes and actions.
 * Features:
 * - Decorator to mark routes for auditing
 * - Capture before/after values for mutations
 * - Write to append-only audit_log table
 * - Include request context (IP, user agent, request ID)
 */

import { Elysia } from "elysia";
import { type DatabaseClient, type TransactionSql } from "./db";
import { type User, type Session } from "./auth-better";
import { type Tenant } from "./tenant";

// =============================================================================
// Types
// =============================================================================

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  sessionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Audit context for a request
 */
export interface AuditContext {
  tenantId: string;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface AuditHelper {
  log: (options: {
    action: string;
    resourceType: string;
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => Promise<string>;
}

/**
 * Options for logging an audit entry
 */
export interface AuditLogOptions {
  /** Action identifier (e.g., hr.employee.created) */
  action: string;
  /** Type of resource (e.g., employee, leave_request) */
  resourceType: string;
  /** ID of the specific resource */
  resourceId?: string;
  /** State before the change */
  oldValue?: Record<string, unknown>;
  /** State after the change */
  newValue?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Audit action categories
 */
export const AuditActions = {
  // Authentication
  AUTH_LOGIN: "security.auth.login",
  AUTH_LOGOUT: "security.auth.logout",
  AUTH_LOGIN_FAILED: "security.auth.login_failed",
  AUTH_PASSWORD_CHANGED: "security.auth.password_changed",
  AUTH_MFA_ENABLED: "security.auth.mfa_enabled",
  AUTH_MFA_DISABLED: "security.auth.mfa_disabled",
  AUTH_MFA_VERIFIED: "security.auth.mfa_verified",

  // Users
  USER_CREATED: "security.user.created",
  USER_UPDATED: "security.user.updated",
  USER_DELETED: "security.user.deleted",
  USER_INVITED: "security.user.invited",
  USER_SUSPENDED: "security.user.suspended",

  // Roles
  ROLE_CREATED: "security.role.created",
  ROLE_UPDATED: "security.role.updated",
  ROLE_DELETED: "security.role.deleted",
  ROLE_ASSIGNED: "security.role.assigned",
  ROLE_REVOKED: "security.role.revoked",

  // Employees
  EMPLOYEE_CREATED: "hr.employee.created",
  EMPLOYEE_UPDATED: "hr.employee.updated",
  EMPLOYEE_DELETED: "hr.employee.deleted",
  EMPLOYEE_TERMINATED: "hr.employee.terminated",
  EMPLOYEE_VIEWED: "hr.employee.viewed",

  // Organization
  ORG_UNIT_CREATED: "hr.org.created",
  ORG_UNIT_UPDATED: "hr.org.updated",
  ORG_UNIT_DELETED: "hr.org.deleted",

  // Positions
  POSITION_CREATED: "hr.position.created",
  POSITION_UPDATED: "hr.position.updated",
  POSITION_DELETED: "hr.position.deleted",

  // Time & Attendance
  TIME_EVENT_RECORDED: "time.event.recorded",
  TIMESHEET_SUBMITTED: "time.timesheet.submitted",
  TIMESHEET_APPROVED: "time.timesheet.approved",
  TIMESHEET_REJECTED: "time.timesheet.rejected",

  // Absence
  ABSENCE_REQUESTED: "absence.request.created",
  ABSENCE_APPROVED: "absence.request.approved",
  ABSENCE_DENIED: "absence.request.denied",
  ABSENCE_CANCELLED: "absence.request.cancelled",

  // Reports
  REPORT_GENERATED: "reports.report.generated",
  REPORT_EXPORTED: "reports.report.exported",
  DATA_EXPORTED: "reports.data.exported",

  // Settings
  SETTINGS_UPDATED: "platform.settings.updated",
  TENANT_UPDATED: "platform.tenant.updated",

  // GDPR Data Access (Article 30 - read audit)
  DATA_ACCESS: "gdpr.data_access",
  EMPLOYEE_DATA_ACCESSED: "gdpr.employee_data.accessed",
  DIVERSITY_DATA_ACCESSED: "gdpr.diversity_data.accessed",
  EMERGENCY_CONTACT_ACCESSED: "gdpr.emergency_contact.accessed",
  DSAR_DATA_ACCESSED: "gdpr.dsar.accessed",
  BENEFITS_DATA_ACCESSED: "gdpr.benefits_data.accessed",
  ABSENCE_DATA_ACCESSED: "gdpr.absence_data.accessed",
  RIGHT_TO_WORK_ACCESSED: "gdpr.right_to_work.accessed",
} as const;

// =============================================================================
// Sensitive Read Routes (GDPR Article 30 Compliance)
// =============================================================================

export interface SensitiveReadRoute {
  pattern: RegExp;
  resourceType: string;
  action: string;
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Routes that access sensitive personal data and require read audit logging.
 * Each entry matches a URL pattern and maps to a resource type and audit action.
 */
export const SENSITIVE_READ_ROUTES: SensitiveReadRoute[] = [
  {
    pattern: new RegExp(`^/api/v1/hr/employees/${UUID_PATTERN}$`),
    resourceType: "employee",
    action: AuditActions.EMPLOYEE_DATA_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/diversity(/.*)?$`),
    resourceType: "diversity",
    action: AuditActions.DIVERSITY_DATA_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/emergency-contacts(/.*)?$`),
    resourceType: "emergency_contact",
    action: AuditActions.EMERGENCY_CONTACT_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/dsar(/.*)?$`),
    resourceType: "dsar",
    action: AuditActions.DSAR_DATA_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/benefits/enrollments/${UUID_PATTERN}$`),
    resourceType: "benefit_enrollment",
    action: AuditActions.BENEFITS_DATA_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/absence/employees/${UUID_PATTERN}(/.*)?$`),
    resourceType: "absence",
    action: AuditActions.ABSENCE_DATA_ACCESSED,
  },
  {
    pattern: new RegExp(`^/api/v1/right-to-work(/.*)?$`),
    resourceType: "right_to_work",
    action: AuditActions.RIGHT_TO_WORK_ACCESSED,
  },
];

/**
 * Match a request path against the sensitive read routes.
 * Returns the matching route info or null if no match.
 */
export function matchSensitiveReadRoute(
  path: string
): { resourceType: string; action: string } | null {
  if (!path) return null;
  for (const route of SENSITIVE_READ_ROUTES) {
    if (route.pattern.test(path)) {
      return { resourceType: route.resourceType, action: route.action };
    }
  }
  return null;
}

/**
 * Check if GDPR read audit logging is enabled via environment variable.
 * Only returns true for the exact string "true" (case-sensitive).
 */
export function isReadAuditEnabled(): boolean {
  return process.env["AUDIT_READ_ACCESS"] === "true";
}

// =============================================================================
// Audit Service
// =============================================================================

/**
 * Service for audit logging operations
 */
export class AuditService {
  constructor(private db: DatabaseClient) {}

  /**
   * Write an audit log entry
   */
  async log(context: AuditContext, options: AuditLogOptions): Promise<string> {
    const result = await this.db.withSystemContext(async (tx) => {
      return await tx<{ id: string }[]>`
        SELECT app.write_audit_log(
          ${context.tenantId}::uuid,
          ${context.userId}::uuid,
          ${options.action},
          ${options.resourceType},
          ${options.resourceId || null}::uuid,
          ${options.oldValue ? JSON.stringify(options.oldValue) : null}::jsonb,
          ${options.newValue ? JSON.stringify(options.newValue) : null}::jsonb,
          ${context.ipAddress},
          ${context.userAgent},
          ${context.requestId},
          ${context.sessionId}::uuid,
          ${JSON.stringify(options.metadata || {})}::jsonb
        ) as id
      `;
    });

    return result[0]?.id || "";
  }

  /**
   * Write an audit log entry within a transaction
   * Use this when you need to audit as part of a larger transaction
   */
  async logInTransaction(
    tx: TransactionSql,
    context: AuditContext,
    options: AuditLogOptions
  ): Promise<string> {
    // Enable system context for the insert
    await tx`SELECT app.enable_system_context()`;

    const result = await tx<{ id: string }[]>`
      SELECT app.write_audit_log(
        ${context.tenantId}::uuid,
        ${context.userId}::uuid,
        ${options.action},
        ${options.resourceType},
        ${options.resourceId || null}::uuid,
        ${options.oldValue ? JSON.stringify(options.oldValue) : null}::jsonb,
        ${options.newValue ? JSON.stringify(options.newValue) : null}::jsonb,
        ${context.ipAddress},
        ${context.userAgent},
        ${context.requestId},
        ${context.sessionId}::uuid,
        ${JSON.stringify(options.metadata || {})}::jsonb
      ) as id
    `;

    await tx`SELECT app.disable_system_context()`;

    return result[0]?.id || "";
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AuditEntry[]> {
    const { limit = 100, offset = 0 } = options;

    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<AuditEntry[]>`
        SELECT id, user_id, action, old_value, new_value, ip_address, request_id, created_at
        FROM app.get_resource_audit_trail(
          ${tenantId}::uuid,
          ${resourceType},
          ${resourceId}::uuid,
          ${limit},
          ${offset}
        )
      `;
    });

    return results.map((r) => ({
      ...r,
      tenantId,
      resourceType,
      resourceId,
      userAgent: null,
      sessionId: null,
      metadata: {},
    })) as AuditEntry[];
  }

  /**
   * Get audit trail for a specific user
   */
  async getUserAuditTrail(
    tenantId: string,
    userId: string,
    options: { from?: Date; to?: Date; limit?: number } = {}
  ): Promise<AuditEntry[]> {
    const {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to = new Date(),
      limit = 100,
    } = options;

    const results = await this.db.withSystemContext(async (tx) => {
      return await tx<
        Array<{
          id: string;
          action: string;
          resourceType: string;
          resourceId: string;
          ipAddress: string | null;
          createdAt: Date;
        }>
      >`
        SELECT id, action, resource_type, resource_id, ip_address, created_at
        FROM app.get_user_audit_trail(
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${from},
          ${to},
          ${limit}
        )
      `;
    });

    return results.map((r) => ({
      id: r.id,
      tenantId,
      userId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      oldValue: null,
      newValue: null,
      ipAddress: r.ipAddress,
      userAgent: null,
      requestId: "",
      sessionId: null,
      metadata: {},
      createdAt: r.createdAt,
    })) as AuditEntry[];
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract client IP from request headers
 */
export function extractClientIp(request: Request): string | null {
  // Check X-Forwarded-For header (when behind proxy)
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    return ips[0] || null;
  }

  // Check X-Real-IP header
  const realIp = request.headers.get("X-Real-IP");
  if (realIp) {
    return realIp;
  }

  // No IP found in headers
  return null;
}

/**
 * Extract user agent from request headers
 */
export function extractUserAgent(request: Request): string | null {
  return request.headers.get("User-Agent");
}

/**
 * Create audit context from request
 */
export function createAuditContext(
  request: Request,
  tenant: Tenant | null,
  user: User | null,
  session: Session | null,
  requestId: string
): AuditContext {
  return {
    tenantId: tenant?.id || "",
    userId: user?.id || null,
    sessionId: session?.id || null,
    ipAddress: extractClientIp(request),
    userAgent: extractUserAgent(request),
    requestId,
  };
}

/**
 * Compare two objects and return the differences
 * Useful for generating oldValue/newValue for updates
 */
export function compareObjects(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null
): {
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  changed: string[];
} {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  const changed: string[] = [];

  if (!oldObj && !newObj) {
    return { oldValue, newValue, changed };
  }

  if (!oldObj) {
    return {
      oldValue: {},
      newValue: newObj || {},
      changed: Object.keys(newObj || {}),
    };
  }

  if (!newObj) {
    return {
      oldValue: oldObj,
      newValue: {},
      changed: Object.keys(oldObj),
    };
  }

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      oldValue[key] = oldVal;
      newValue[key] = newVal;
      changed.push(key);
    }
  }

  return { oldValue, newValue, changed };
}

/**
 * Sanitize sensitive fields from audit data
 */
export function sanitizeAuditData(
  data: Record<string, unknown>,
  sensitiveFields: string[] = [
    "password",
    "password_hash",
    "passwordHash",
    "mfa_secret",
    "mfaSecret",
    "token",
    "secret",
    "api_key",
    "apiKey",
  ]
): Record<string, unknown> {
  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Audit plugin for Elysia
 *
 * Provides audit logging capabilities and request context.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(authPlugin())
 *   .use(tenantPlugin())
 *   .use(auditPlugin())
 *   .post('/employees', async ({ audit, auditService }) => {
 *     const employee = await createEmployee();
 *     await auditService.log(audit, {
 *       action: AuditActions.EMPLOYEE_CREATED,
 *       resourceType: 'employee',
 *       resourceId: employee.id,
 *       newValue: employee,
 *     });
 *     return employee;
 *   });
 * ```
 */
export function auditPlugin() {
  // Singleton: created once when plugin is initialized, reused across all requests
  let auditServiceSingleton: AuditService | null = null;

  return new Elysia({ name: "audit" })
    // Audit service for direct access (singleton)
    .derive({ as: "global" }, (ctx) => {
      const { db } = ctx as any;
      if (!auditServiceSingleton) {
        auditServiceSingleton = new AuditService(db);
      }
      return {
        auditService: auditServiceSingleton,
      } as Record<string, unknown>;
    })

    // Create audit context for the request
    .derive({ as: "global" }, (ctx) => {
      const { request, tenant, user, session, requestId, auditService } = ctx as any;

      const context = createAuditContext(
        request,
        tenant || null,
        user || null,
        session || null,
        requestId
      );

      const audit: AuditHelper = {
        log: async (options) => {
          if (!context.tenantId) return "";
          return auditService.log(context, {
            action: options.action,
            resourceType: options.resourceType,
            resourceId: options.resourceId,
            oldValue: options.oldValues,
            newValue: options.newValues,
            metadata: options.metadata,
          });
        },
      };

      return {
        audit,
      } as Record<string, unknown>;
    });
}

/**
 * Create a typed audit logger for a specific resource type
 */
export function createAuditLogger<T extends Record<string, unknown>>(
  resourceType: string
) {
  return {
    created: (
      service: AuditService,
      context: AuditContext,
      resourceId: string,
      data: T
    ) =>
      service.log(context, {
        action: `${resourceType}.created`,
        resourceType,
        resourceId,
        newValue: sanitizeAuditData(data as Record<string, unknown>),
      }),

    updated: (
      service: AuditService,
      context: AuditContext,
      resourceId: string,
      oldData: Partial<T>,
      newData: Partial<T>
    ) => {
      const { oldValue, newValue, changed } = compareObjects(
        sanitizeAuditData(oldData as Record<string, unknown>),
        sanitizeAuditData(newData as Record<string, unknown>)
      );

      if (changed.length === 0) {
        return Promise.resolve(""); // No changes, no audit
      }

      return service.log(context, {
        action: `${resourceType}.updated`,
        resourceType,
        resourceId,
        oldValue,
        newValue,
        metadata: { changedFields: changed },
      });
    },

    deleted: (
      service: AuditService,
      context: AuditContext,
      resourceId: string,
      data?: T
    ) =>
      service.log(context, {
        action: `${resourceType}.deleted`,
        resourceType,
        resourceId,
        oldValue: data
          ? sanitizeAuditData(data as Record<string, unknown>)
          : undefined,
      }),

    viewed: (
      service: AuditService,
      context: AuditContext,
      resourceId: string
    ) =>
      service.log(context, {
        action: `${resourceType}.viewed`,
        resourceType,
        resourceId,
      }),

    custom: (
      service: AuditService,
      context: AuditContext,
      action: string,
      options: Omit<AuditLogOptions, "action" | "resourceType">
    ) =>
      service.log(context, {
        ...options,
        action: `${resourceType}.${action}`,
        resourceType,
      }),
  };
}
