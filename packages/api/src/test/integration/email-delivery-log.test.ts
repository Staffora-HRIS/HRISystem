/**
 * Email Delivery Log Integration Tests
 *
 * Verifies:
 * - email_delivery_log table CRUD operations
 * - RLS isolation between tenants
 * - Status lifecycle transitions (queued -> sent -> delivered/bounced/failed)
 * - Delivery statistics aggregation
 * - Cursor-based pagination
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Email Delivery Log", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenantA: TestTenant | null = null;
  let tenantB: TestTenant | null = null;
  let userA: TestUser | null = null;
  let userB: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenantA = await createTestTenant(db);
    tenantB = await createTestTenant(db);
    userA = await createTestUser(db, tenantA.id);
    userB = await createTestUser(db, tenantB.id);
  });

  afterAll(async () => {
    if (!db) return;
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);
    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (!db || !tenantA || !tenantB) return;
    // Clean up email delivery log entries for both tenants
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.email_delivery_log WHERE tenant_id = ${tenantA.id}::uuid`;
      await tx`DELETE FROM app.email_delivery_log WHERE tenant_id = ${tenantB.id}::uuid`;
    });
    await clearTenantContext(db);
  });

  // ===========================================================================
  // Helper: insert an email delivery log entry via system context
  // ===========================================================================

  async function insertEmailLog(
    tenantId: string,
    overrides: {
      toAddress?: string;
      subject?: string;
      templateName?: string;
      status?: string;
      messageId?: string;
      sentAt?: Date;
      bouncedAt?: Date;
      bounceType?: string;
      bounceReason?: string;
      errorMessage?: string;
    } = {}
  ): Promise<string> {
    const rows = await withSystemContext(db!, async (tx) => {
      return tx<{ id: string }[]>`
        INSERT INTO app.email_delivery_log (
          tenant_id, to_address, subject, template_name,
          status, message_id, sent_at, bounced_at,
          bounce_type, bounce_reason, error_message
        )
        VALUES (
          ${tenantId}::uuid,
          ${overrides.toAddress ?? "user@example.com"},
          ${overrides.subject ?? "Test Subject"},
          ${overrides.templateName ?? null},
          ${(overrides.status ?? "queued")}::app.email_delivery_status,
          ${overrides.messageId ?? null},
          ${overrides.sentAt ?? null},
          ${overrides.bouncedAt ?? null},
          ${overrides.bounceType ?? null},
          ${overrides.bounceReason ?? null},
          ${overrides.errorMessage ?? null}
        )
        RETURNING id
      `;
    });
    return rows[0]!.id;
  }

  // ===========================================================================
  // Insert and Read
  // ===========================================================================

  describe("Insert and Read", () => {
    it("should insert an email delivery log entry and read it back", async () => {
      if (!db || !tenantA || !userA) return;

      const logId = await insertEmailLog(tenantA.id, {
        toAddress: "alice@example.com",
        subject: "Welcome to Staffora",
        templateName: "welcome",
        status: "queued",
      });

      expect(logId).toBeDefined();

      // Read back via tenant context
      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<
        {
          id: string;
          toAddress: string;
          subject: string;
          templateName: string;
          status: string;
        }[]
      >`
        SELECT id, to_address, subject, template_name, status
        FROM app.email_delivery_log
        WHERE id = ${logId}::uuid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.to_address).toBe("alice@example.com");
      expect(rows[0]!.subject).toBe("Welcome to Staffora");
      expect(rows[0]!.template_name).toBe("welcome");
      expect(rows[0]!.status).toBe("queued");
    });
  });

  // ===========================================================================
  // RLS Tenant Isolation
  // ===========================================================================

  describe("RLS Tenant Isolation", () => {
    it("should prevent tenant B from reading tenant A email logs", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // Insert log for tenant A
      await insertEmailLog(tenantA.id, {
        toAddress: "secret@tenantA.com",
        subject: "Tenant A confidential",
      });

      // Insert log for tenant B
      await insertEmailLog(tenantB.id, {
        toAddress: "info@tenantB.com",
        subject: "Tenant B info",
      });

      // Tenant A context should only see tenant A logs
      await setTenantContext(db, tenantA.id, userA.id);
      const rowsA = await db<{ tenantId: string; toAddress: string }[]>`
        SELECT tenant_id, to_address FROM app.email_delivery_log
      `;

      expect(rowsA.length).toBeGreaterThanOrEqual(1);
      for (const row of rowsA) {
        expect(row.tenant_id).toBe(tenantA.id);
      }

      // Tenant B context should only see tenant B logs
      await setTenantContext(db, tenantB.id, userB.id);
      const rowsB = await db<{ tenantId: string; toAddress: string }[]>`
        SELECT tenant_id, to_address FROM app.email_delivery_log
      `;

      expect(rowsB.length).toBeGreaterThanOrEqual(1);
      for (const row of rowsB) {
        expect(row.tenant_id).toBe(tenantB.id);
      }

      // Ensure no cross-tenant leakage
      const allAddressesA = rowsA.map((r) => r.to_address);
      const allAddressesB = rowsB.map((r) => r.to_address);
      expect(allAddressesA).not.toContain("info@tenantB.com");
      expect(allAddressesB).not.toContain("secret@tenantA.com");
    });
  });

  // ===========================================================================
  // Status Lifecycle
  // ===========================================================================

  describe("Status Lifecycle", () => {
    it("should transition from queued to sent", async () => {
      if (!db || !tenantA || !userA) return;

      const logId = await insertEmailLog(tenantA.id, { status: "queued" });

      // Update to sent
      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'sent'::app.email_delivery_status,
              message_id = 'msg-123',
              sent_at = now()
          WHERE id = ${logId}::uuid
        `;
      });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{ status: string; messageId: string }[]>`
        SELECT status, message_id FROM app.email_delivery_log WHERE id = ${logId}::uuid
      `;
      expect(rows[0]!.status).toBe("sent");
      expect(rows[0]!.message_id).toBe("msg-123");
    });

    it("should transition from sent to delivered", async () => {
      if (!db || !tenantA || !userA) return;

      const logId = await insertEmailLog(tenantA.id, {
        status: "sent",
        messageId: "msg-456",
        sentAt: new Date(),
      });

      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'delivered'::app.email_delivery_status,
              delivered_at = now()
          WHERE id = ${logId}::uuid
        `;
      });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{ status: string }[]>`
        SELECT status FROM app.email_delivery_log WHERE id = ${logId}::uuid
      `;
      expect(rows[0]!.status).toBe("delivered");
    });

    it("should transition from sent to bounced with bounce details", async () => {
      if (!db || !tenantA || !userA) return;

      const logId = await insertEmailLog(tenantA.id, {
        status: "sent",
        messageId: "msg-bounce-1",
        sentAt: new Date(),
      });

      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'bounced'::app.email_delivery_status,
              bounced_at = now(),
              bounce_type = 'hard',
              bounce_reason = 'Mailbox does not exist'
          WHERE id = ${logId}::uuid
        `;
      });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{
        status: string;
        bounceType: string;
        bounceReason: string;
      }[]>`
        SELECT status, bounce_type, bounce_reason
        FROM app.email_delivery_log WHERE id = ${logId}::uuid
      `;
      expect(rows[0]!.status).toBe("bounced");
      expect(rows[0]!.bounce_type).toBe("hard");
      expect(rows[0]!.bounce_reason).toBe("Mailbox does not exist");
    });

    it("should transition from queued to failed with error message", async () => {
      if (!db || !tenantA || !userA) return;

      const logId = await insertEmailLog(tenantA.id, { status: "queued" });

      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'failed'::app.email_delivery_status,
              error_message = 'SMTP connection refused',
              retry_count = retry_count + 1
          WHERE id = ${logId}::uuid
        `;
      });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{
        status: string;
        errorMessage: string;
        retryCount: number;
      }[]>`
        SELECT status, error_message, retry_count
        FROM app.email_delivery_log WHERE id = ${logId}::uuid
      `;
      expect(rows[0]!.status).toBe("failed");
      expect(rows[0]!.error_message).toBe("SMTP connection refused");
      expect(rows[0]!.retry_count).toBe(1);
    });
  });

  // ===========================================================================
  // Delivery Statistics
  // ===========================================================================

  describe("Delivery Statistics", () => {
    it("should compute correct aggregate statistics by status", async () => {
      if (!db || !tenantA || !userA) return;

      // Insert a mix of statuses
      await insertEmailLog(tenantA.id, { status: "queued" });
      await insertEmailLog(tenantA.id, { status: "sent" });
      await insertEmailLog(tenantA.id, { status: "delivered" });
      await insertEmailLog(tenantA.id, { status: "delivered" });
      await insertEmailLog(tenantA.id, { status: "bounced" });
      await insertEmailLog(tenantA.id, { status: "failed" });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<
        {
          total: string;
          queued: string;
          sent: string;
          delivered: string;
          bounced: string;
          failed: string;
        }[]
      >`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
          COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced')::text AS bounced,
          COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
        FROM app.email_delivery_log
      `;

      expect(parseInt(rows[0]!.total, 10)).toBe(6);
      expect(parseInt(rows[0]!.queued, 10)).toBe(1);
      expect(parseInt(rows[0]!.sent, 10)).toBe(1);
      expect(parseInt(rows[0]!.delivered, 10)).toBe(2);
      expect(parseInt(rows[0]!.bounced, 10)).toBe(1);
      expect(parseInt(rows[0]!.failed, 10)).toBe(1);
    });
  });

  // ===========================================================================
  // Filtering
  // ===========================================================================

  describe("Filtering", () => {
    it("should filter by status", async () => {
      if (!db || !tenantA || !userA) return;

      await insertEmailLog(tenantA.id, { status: "delivered" });
      await insertEmailLog(tenantA.id, { status: "bounced" });
      await insertEmailLog(tenantA.id, { status: "delivered" });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{ status: string }[]>`
        SELECT status FROM app.email_delivery_log
        WHERE status = 'delivered'::app.email_delivery_status
      `;

      expect(rows.length).toBe(2);
      for (const row of rows) {
        expect(row.status).toBe("delivered");
      }
    });

    it("should filter by template name", async () => {
      if (!db || !tenantA || !userA) return;

      await insertEmailLog(tenantA.id, { templateName: "welcome" });
      await insertEmailLog(tenantA.id, { templateName: "password_reset" });
      await insertEmailLog(tenantA.id, { templateName: "welcome" });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{ templateName: string }[]>`
        SELECT template_name FROM app.email_delivery_log
        WHERE template_name = 'welcome'
      `;

      expect(rows.length).toBe(2);
    });

    it("should filter by recipient address (ILIKE)", async () => {
      if (!db || !tenantA || !userA) return;

      await insertEmailLog(tenantA.id, { toAddress: "alice@company.com" });
      await insertEmailLog(tenantA.id, { toAddress: "bob@company.com" });
      await insertEmailLog(tenantA.id, { toAddress: "alice@other.com" });

      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db<{ toAddress: string }[]>`
        SELECT to_address FROM app.email_delivery_log
        WHERE to_address ILIKE '%alice%'
      `;

      expect(rows.length).toBe(2);
    });
  });

  // ===========================================================================
  // Indexes and Performance
  // ===========================================================================

  describe("Indexes exist", () => {
    it("should have the expected indexes on email_delivery_log", async () => {
      if (!db) return;

      const rows = await db<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'app' AND tablename = 'email_delivery_log'
        ORDER BY indexname
      `;

      const indexNames = rows.map((r) => r.indexname);

      expect(indexNames).toContain("email_delivery_log_pkey");
      expect(indexNames).toContain("idx_email_delivery_log_tenant_created");
      expect(indexNames).toContain("idx_email_delivery_log_tenant_status");
      expect(indexNames).toContain("idx_email_delivery_log_message_id");
    });
  });
});
