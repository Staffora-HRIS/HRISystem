/**
 * Tenant Provisioning Module - Service Layer
 *
 * Business logic for automated tenant provisioning.
 * Orchestrates tenant creation, role setup, admin user creation,
 * seed data, and welcome email in a single transactional flow.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "../../lib/service-errors";
import { TenantProvisioningRepository } from "./repository";
import type {
  ProvisionTenant,
  ProvisionTenantResponse,
  ProvisioningStepResponse,
  ProvisioningLogResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

interface ProvisioningContext {
  userId?: string;
}

// =============================================================================
// Service
// =============================================================================

export class TenantProvisioningService {
  constructor(
    private repository: TenantProvisioningRepository,
    private db: DatabaseClient
  ) {}

  /**
   * Provision a new tenant with all required setup steps.
   *
   * Steps:
   * 1. Validate slug uniqueness
   * 2. Create tenant record
   * 3. Create provisioning log
   * 4. Create default roles
   * 5. Create admin user (via Better Auth tables)
   * 6. Assign tenant_admin role to admin user
   * 7. Seed demo data (optional)
   * 8. Emit domain event for welcome email (optional)
   */
  async provisionTenant(
    ctx: ProvisioningContext,
    data: ProvisionTenant
  ): Promise<ServiceResult<ProvisionTenantResponse>> {
    return withServiceErrorHandling("provisioning tenant", async () => {
      // Generate slug if not provided
      const slug =
        data.slug || this.generateSlug(data.name);

      // Check slug uniqueness before starting the transaction
      const slugTaken = await this.repository.slugExists(slug);
      if (slugTaken) {
        return serviceFailure("CONFLICT", `Tenant slug '${slug}' is already taken`);
      }

      const steps: ProvisioningStepResponse[] = [];
      let tenantId = "";
      let tenantSlug = "";
      let provisioningLogId = "";
      let adminUserId = "";

      // Run entire provisioning in system context since we are creating a new tenant
      const result = await this.db.withSystemContext(
        async (tx: TransactionSql) => {
          // Step 1: Create tenant
          const stepCreateTenant = this.startStep("create_tenant");
          try {
            const tenant = await this.repository.createTenant(tx, {
              name: data.name,
              slug,
              settings: {
                ...this.getDefaultSettings(),
                ...(data.settings || {}),
              },
            });
            tenantId = tenant.id;
            tenantSlug = tenant.slug;
            this.completeStep(stepCreateTenant);
            steps.push(stepCreateTenant);
          } catch (error) {
            this.failStep(stepCreateTenant, error);
            steps.push(stepCreateTenant);
            throw error;
          }

          // Step 2: Create provisioning log
          const stepCreateLog = this.startStep("create_provisioning_log");
          try {
            provisioningLogId = await this.repository.createProvisioningLog(tx, {
              tenantId,
              initiatedBy: ctx.userId || null,
              config: {
                name: data.name,
                slug: tenantSlug,
                adminEmail: data.adminEmail,
                seedDemoData: data.seedDemoData ?? false,
                sendWelcomeEmail: data.sendWelcomeEmail ?? true,
              },
            });
            this.completeStep(stepCreateLog);
            steps.push(stepCreateLog);
          } catch (error) {
            this.failStep(stepCreateLog, error);
            steps.push(stepCreateLog);
            throw error;
          }

          // Step 3: Create default roles
          const stepCreateRoles = this.startStep("create_default_roles");
          try {
            await this.repository.createDefaultRoles(tx, tenantId);
            this.completeStep(stepCreateRoles);
            steps.push(stepCreateRoles);
          } catch (error) {
            this.failStep(stepCreateRoles, error);
            steps.push(stepCreateRoles);
            throw error;
          }

          // Step 4: Create admin user across all three required tables
          const stepCreateAdmin = this.startStep("create_admin_user");
          try {
            adminUserId = await this.createAdminUser(tx, {
              tenantId,
              email: data.adminEmail,
              firstName: data.adminFirstName,
              lastName: data.adminLastName,
              password: data.adminPassword,
            });
            this.completeStep(stepCreateAdmin);
            steps.push(stepCreateAdmin);
          } catch (error) {
            this.failStep(stepCreateAdmin, error);
            steps.push(stepCreateAdmin);
            throw error;
          }

          // Step 5: Create user-tenant association
          const stepAssociation = this.startStep("create_user_tenant_association");
          try {
            await this.repository.createUserTenantAssociation(tx, {
              userId: adminUserId,
              tenantId,
              isPrimary: true,
            });
            this.completeStep(stepAssociation);
            steps.push(stepAssociation);
          } catch (error) {
            this.failStep(stepAssociation, error);
            steps.push(stepAssociation);
            throw error;
          }

          // Step 6: Assign tenant_admin role
          const stepAssignRole = this.startStep("assign_admin_role");
          try {
            await this.repository.assignRoleToUser(tx, {
              tenantId,
              userId: adminUserId,
              roleName: "tenant_admin",
            });
            this.completeStep(stepAssignRole);
            steps.push(stepAssignRole);
          } catch (error) {
            this.failStep(stepAssignRole, error);
            steps.push(stepAssignRole);
            throw error;
          }

          // Step 7: Create admin employee record
          const stepCreateEmployee = this.startStep("create_admin_employee");
          try {
            await this.createAdminEmployee(tx, {
              tenantId,
              userId: adminUserId,
              firstName: data.adminFirstName,
              lastName: data.adminLastName,
              email: data.adminEmail,
            });
            this.completeStep(stepCreateEmployee);
            steps.push(stepCreateEmployee);
          } catch (error) {
            this.failStep(stepCreateEmployee, error);
            steps.push(stepCreateEmployee);
            throw error;
          }

          // Step 8: Seed demo data if requested
          if (data.seedDemoData) {
            const stepSeed = this.startStep("seed_demo_data");
            try {
              await this.seedDemoData(tx, tenantId);
              this.completeStep(stepSeed);
              steps.push(stepSeed);
            } catch (error) {
              this.failStep(stepSeed, error);
              steps.push(stepSeed);
              throw error;
            }
          }

          // Step 9: Emit domain event for welcome email
          if (data.sendWelcomeEmail !== false) {
            const stepEvent = this.startStep("emit_welcome_event");
            try {
              await emitDomainEvent(tx, {
                tenantId,
                aggregateType: "tenant",
                aggregateId: tenantId,
                eventType: "tenant.provisioned",
                payload: {
                  tenantName: data.name,
                  tenantSlug,
                  adminEmail: data.adminEmail,
                  adminFirstName: data.adminFirstName,
                  adminLastName: data.adminLastName,
                  sendWelcomeEmail: true,
                },
                userId: ctx.userId,
              });
              this.completeStep(stepEvent);
              steps.push(stepEvent);
            } catch (error) {
              this.failStep(stepEvent, error);
              steps.push(stepEvent);
              throw error;
            }
          }

          // Update provisioning log to completed
          await this.repository.updateProvisioningLog(tx, provisioningLogId, {
            status: "completed",
            steps,
            completedAt: true,
          });

          return {
            tenantId,
            tenantSlug,
            provisioningLogId,
            status: "completed",
            adminUserId,
            steps,
          };
        }
      );

      return serviceSuccess(result);
    });
  }

  /**
   * List provisioning logs with optional filtering and cursor-based pagination.
   */
  async listProvisioningLogs(filters: {
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<
    ServiceResult<{
      items: ProvisioningLogResponse[];
      nextCursor: string | null;
      hasMore: boolean;
    }>
  > {
    return withServiceErrorHandling("listing provisioning logs", async () => {
      const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
      const result = await this.repository.listProvisioningLogs({
        ...filters,
        limit,
      });
      return serviceSuccess({
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      });
    });
  }

  /**
   * Get a single provisioning log by ID.
   */
  async getProvisioningLog(
    id: string
  ): Promise<ServiceResult<ProvisioningLogResponse>> {
    return withServiceErrorHandling("getting provisioning log", async () => {
      const log = await this.repository.getProvisioningLog(id);
      if (!log) {
        return serviceFailure("NOT_FOUND", "Provisioning log not found");
      }
      return serviceSuccess(log);
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Create admin user across all three required tables:
   * 1. app.users (legacy)
   * 2. app."user" (Better Auth)
   * 3. app."account" (Better Auth credential)
   */
  private async createAdminUser(
    tx: TransactionSql,
    data: {
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      password: string;
    }
  ): Promise<string> {
    const userId = crypto.randomUUID();
    const betterAuthUserId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Hash the password using scrypt (Better Auth's default)
    const hashedPassword = await this.hashPassword(data.password);

    // 1. Create legacy users record
    await tx`
      INSERT INTO app.users (id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
      VALUES (${userId}::uuid, ${data.email}, ${hashedPassword}, ${data.firstName}, ${data.lastName}, true, now(), now())
    `;

    // 2. Create Better Auth user record
    await tx`
      INSERT INTO app."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${betterAuthUserId}, ${data.firstName + " " + data.lastName}, ${data.email}, true, ${now}::timestamptz, ${now}::timestamptz)
    `;

    // 3. Create Better Auth account (credential) record
    await tx`
      INSERT INTO app."account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${betterAuthUserId}, 'credential', ${betterAuthUserId}, ${hashedPassword}, ${now}::timestamptz, ${now}::timestamptz)
    `;

    return userId;
  }

  /**
   * Create an employee record for the admin user.
   */
  private async createAdminEmployee(
    tx: TransactionSql,
    data: {
      tenantId: string;
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.employees (
        id, tenant_id, user_id, employee_number, first_name, last_name,
        email, status, start_date, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), ${data.tenantId}::uuid, ${data.userId}::uuid,
        'EMP-0001', ${data.firstName}, ${data.lastName},
        ${data.email}, 'active', CURRENT_DATE, now(), now()
      )
    `;
  }

  /**
   * Hash a password using Bun's scrypt implementation (compatible with Better Auth).
   */
  private async hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
  }

  /**
   * Seed demo data for a new tenant (leave types, departments, etc.).
   */
  private async seedDemoData(
    tx: TransactionSql,
    tenantId: string
  ): Promise<void> {
    // Create default leave types
    const leaveTypes = [
      { name: "Annual Leave", code: "annual", daysPerYear: 28, isPaid: true },
      { name: "Sick Leave", code: "sick", daysPerYear: 0, isPaid: true },
      { name: "Maternity Leave", code: "maternity", daysPerYear: 0, isPaid: true },
      { name: "Paternity Leave", code: "paternity", daysPerYear: 0, isPaid: true },
      { name: "Unpaid Leave", code: "unpaid", daysPerYear: 0, isPaid: false },
    ];

    for (const lt of leaveTypes) {
      await tx`
        INSERT INTO app.leave_types (id, tenant_id, name, code, default_days_per_year, is_paid, is_active)
        VALUES (gen_random_uuid(), ${tenantId}::uuid, ${lt.name}, ${lt.code}, ${lt.daysPerYear}, ${lt.isPaid}, true)
        ON CONFLICT DO NOTHING
      `;
    }

    // Create a default org unit (root)
    await tx`
      INSERT INTO app.org_units (id, tenant_id, name, code, level, is_active)
      VALUES (gen_random_uuid(), ${tenantId}::uuid, 'Head Office', 'HQ', 0, true)
      ON CONFLICT DO NOTHING
    `;
  }

  /**
   * Get default tenant settings.
   */
  private getDefaultSettings(): Record<string, unknown> {
    return {
      featureFlags: {
        absenceManagement: true,
        timeTracking: true,
        performanceReviews: true,
        lms: false,
        recruitment: false,
        benefits: false,
        caseManagement: false,
      },
      branding: {
        primaryColor: "#2563eb",
        logoUrl: null,
      },
      locale: {
        timezone: "Europe/London",
        dateFormat: "DD/MM/YYYY",
        currency: "GBP",
      },
      notifications: {
        emailEnabled: true,
        pushEnabled: false,
      },
    };
  }

  /**
   * Generate a URL-safe slug from a tenant name.
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);
  }

  // ===========================================================================
  // Step Tracking Helpers
  // ===========================================================================

  private startStep(name: string): ProvisioningStepResponse {
    return {
      step: name,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
  }

  private completeStep(step: ProvisioningStepResponse): void {
    step.status = "completed";
    step.completedAt = new Date().toISOString();
  }

  private failStep(step: ProvisioningStepResponse, error: unknown): void {
    step.status = "failed";
    step.completedAt = new Date().toISOString();
    step.error = error instanceof Error ? error.message : String(error);
  }
}
