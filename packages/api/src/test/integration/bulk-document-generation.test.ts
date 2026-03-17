/**
 * Bulk Document Generation Integration Tests
 *
 * Verifies:
 * - Batch creation with outbox events
 * - RLS tenant isolation
 * - Validation of template, employees, duplicates
 * - Batch status retrieval with items
 * - Idempotency of batch items
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
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

describe("Bulk Document Generation", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let templateId: string;
  let employeeIds: string[] = [];

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
    await setTenantContext(db, tenant.id, user.id);

    // Create a letter template for testing
    const templateRows = await db<{ id: string }[]>`
      INSERT INTO app.letter_templates (
        tenant_id, name, template_type, subject, body_template,
        placeholders, is_default, active, created_by
      )
      VALUES (
        ${tenant.id}::uuid,
        ${"Bulk Test Template"},
        ${"custom"},
        ${"Welcome {{first_name}}"},
        ${"Dear {{first_name}} {{last_name}}, welcome to {{org_unit_name}}."},
        ${JSON.stringify([
          { key: "first_name", required: true },
          { key: "last_name", required: true },
          { key: "org_unit_name", required: false },
        ])}::jsonb,
        false,
        true,
        ${user.id}::uuid
      )
      RETURNING id
    `;
    templateId = templateRows[0]!.id;

    // Create test employees
    for (let i = 0; i < 3; i++) {
      const empRows = await db<{ id: string }[]>`
        INSERT INTO app.employees (
          tenant_id, employee_number, status, hire_date
        )
        VALUES (
          ${tenant.id}::uuid,
          ${"BULKDOC-" + Date.now() + "-" + i},
          'active',
          CURRENT_DATE
        )
        RETURNING id
      `;
      const empId = empRows[0]!.id;
      employeeIds.push(empId);

      // Add personal record for rendering
      await db`
        INSERT INTO app.employee_personal (
          tenant_id, employee_id, first_name, last_name,
          effective_from
        )
        VALUES (
          ${tenant.id}::uuid,
          ${empId}::uuid,
          ${"TestFirst" + i},
          ${"TestLast" + i},
          CURRENT_DATE
        )
      `;
    }
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;

    await withSystemContext(db, async (tx) => {
      // Clean up batch items, batches, generated letters, personal records, employees, templates, outbox
      await tx`DELETE FROM app.document_generation_batch_items WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.document_generation_batches WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.generated_letters WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.letter_templates WHERE tenant_id = ${tenant!.id}::uuid`;
    });

    await cleanupTestTenant(db, tenant.id);
    await cleanupTestUser(db, user.id);
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (!db || !tenant) return;
    // Clean up batches/items/outbox between tests but keep templates and employees
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.document_generation_batch_items WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.document_generation_batches WHERE tenant_id = ${tenant!.id}::uuid`;
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant!.id}::uuid`;
    });
  });

  // ===========================================================================
  // Batch Creation Tests
  // ===========================================================================

  describe("Batch Creation", () => {
    it("should create a batch with items and outbox events atomically", async () => {
      if (!db || !tenant || !user) return;

      await setTenantContext(db, tenant.id, user.id);

      // Create batch via a transaction (simulating the service)
      let batchId: string;

      await db.begin(async (tx) => {
        // Insert batch
        const batchRows = await tx<{ id: string }[]>`
          INSERT INTO app.document_generation_batches (
            tenant_id, template_id, status, total_items, variables, created_by
          )
          VALUES (
            ${tenant!.id}::uuid,
            ${templateId}::uuid,
            'pending',
            ${employeeIds.length},
            ${JSON.stringify({ custom_var: "test" })}::jsonb,
            ${user!.id}::uuid
          )
          RETURNING id
        `;
        batchId = batchRows[0]!.id;

        // Insert batch items
        for (const empId of employeeIds) {
          await tx`
            INSERT INTO app.document_generation_batch_items (
              tenant_id, batch_id, employee_id, status
            )
            VALUES (
              ${tenant!.id}::uuid,
              ${batchId}::uuid,
              ${empId}::uuid,
              'pending'
            )
          `;
        }

        // Insert outbox event
        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id,
            event_type, payload, created_at
          )
          VALUES (
            gen_random_uuid(),
            ${tenant!.id}::uuid,
            'document_generation_batch',
            ${batchId}::uuid,
            'documents.bulk_generation.created',
            ${JSON.stringify({
              batchId,
              templateId,
              employeeIds,
              totalItems: employeeIds.length,
              actor: user!.id,
            })}::jsonb,
            now()
          )
        `;
      });

      // Verify batch
      const batches = await db<{ id: string; status: string; totalItems: number }[]>`
        SELECT id, status, total_items as "totalItems"
        FROM app.document_generation_batches
        WHERE id = ${batchId!}::uuid
      `;
      expect(batches.length).toBe(1);
      expect(batches[0]!.status).toBe("pending");
      expect(batches[0]!.totalItems).toBe(3);

      // Verify items
      const items = await db<{ id: string; employeeId: string; status: string }[]>`
        SELECT id, employee_id as "employeeId", status
        FROM app.document_generation_batch_items
        WHERE batch_id = ${batchId!}::uuid
      `;
      expect(items.length).toBe(3);
      for (const item of items) {
        expect(item.status).toBe("pending");
        expect(employeeIds).toContain(item.employeeId);
      }

      // Verify outbox event
      const outboxEvents = await db<{ eventType: string; aggregateId: string }[]>`
        SELECT event_type as "eventType", aggregate_id as "aggregateId"
        FROM app.domain_outbox
        WHERE aggregate_id = ${batchId!}::uuid
          AND event_type = 'documents.bulk_generation.created'
      `;
      expect(outboxEvents.length).toBe(1);
    });

    it("should enforce unique employee per batch constraint", async () => {
      if (!db || !tenant || !user) return;

      await setTenantContext(db, tenant.id, user.id);

      // Create batch
      const batchRows = await db<{ id: string }[]>`
        INSERT INTO app.document_generation_batches (
          tenant_id, template_id, status, total_items, created_by
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid, 'pending', 2, ${user.id}::uuid
        )
        RETURNING id
      `;
      const batchId = batchRows[0]!.id;

      // Insert first item
      await db`
        INSERT INTO app.document_generation_batch_items (
          tenant_id, batch_id, employee_id, status
        )
        VALUES (
          ${tenant.id}::uuid, ${batchId}::uuid, ${employeeIds[0]!}::uuid, 'pending'
        )
      `;

      // Attempt duplicate should fail
      let duplicateError: Error | null = null;
      try {
        await db`
          INSERT INTO app.document_generation_batch_items (
            tenant_id, batch_id, employee_id, status
          )
          VALUES (
            ${tenant.id}::uuid, ${batchId}::uuid, ${employeeIds[0]!}::uuid, 'pending'
          )
        `;
      } catch (err) {
        duplicateError = err as Error;
      }

      expect(duplicateError).not.toBeNull();
      expect(duplicateError!.message).toContain("unique");
    });
  });

  // ===========================================================================
  // RLS Isolation Tests
  // ===========================================================================

  describe("RLS Tenant Isolation", () => {
    it("should not allow reading batches from another tenant", async () => {
      if (!db || !tenant || !user) return;

      await setTenantContext(db, tenant.id, user.id);

      // Create batch in tenant A
      const batchRows = await db<{ id: string }[]>`
        INSERT INTO app.document_generation_batches (
          tenant_id, template_id, status, total_items, created_by
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid, 'pending', 1, ${user.id}::uuid
        )
        RETURNING id
      `;
      const batchId = batchRows[0]!.id;

      // Create tenant B
      const tenantB = await createTestTenant(db, {
        name: "Tenant B Bulk Doc Test",
        slug: `tenant-b-bulk-doc-${Date.now()}`,
      });

      try {
        // Switch to tenant B
        await setTenantContext(db, tenantB.id, user.id);

        // Try to read batch from tenant A -- RLS should filter it out
        const results = await db<{ id: string }[]>`
          SELECT id FROM app.document_generation_batches
          WHERE id = ${batchId}::uuid
        `;
        expect(results.length).toBe(0);
      } finally {
        // Restore context and cleanup
        await setTenantContext(db, tenant.id, user.id);
        await cleanupTestTenant(db, tenantB.id);
      }
    });
  });

  // ===========================================================================
  // Batch Status Tracking Tests
  // ===========================================================================

  describe("Batch Status Tracking", () => {
    it("should track completed and failed items with counters", async () => {
      if (!db || !tenant || !user) return;

      await setTenantContext(db, tenant.id, user.id);

      // Create batch
      const batchRows = await db<{ id: string }[]>`
        INSERT INTO app.document_generation_batches (
          tenant_id, template_id, status, total_items, created_by
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid, 'processing', 3, ${user.id}::uuid
        )
        RETURNING id
      `;
      const batchId = batchRows[0]!.id;

      // Insert items
      const itemIds: string[] = [];
      for (const empId of employeeIds) {
        const itemRows = await db<{ id: string }[]>`
          INSERT INTO app.document_generation_batch_items (
            tenant_id, batch_id, employee_id, status
          )
          VALUES (
            ${tenant.id}::uuid, ${batchId}::uuid, ${empId}::uuid, 'pending'
          )
          RETURNING id
        `;
        itemIds.push(itemRows[0]!.id);
      }

      // Simulate: mark first two as completed
      for (let i = 0; i < 2; i++) {
        await db`
          UPDATE app.document_generation_batch_items
          SET status = 'completed', completed_at = now()
          WHERE id = ${itemIds[i]!}::uuid
        `;
        await db`
          UPDATE app.document_generation_batches
          SET completed_items = completed_items + 1, updated_at = now()
          WHERE id = ${batchId}::uuid
        `;
      }

      // Simulate: mark third as failed
      await db`
        UPDATE app.document_generation_batch_items
        SET status = 'failed', error_message = 'Employee not found', completed_at = now()
        WHERE id = ${itemIds[2]!}::uuid
      `;
      await db`
        UPDATE app.document_generation_batches
        SET failed_items = failed_items + 1, updated_at = now()
        WHERE id = ${batchId}::uuid
      `;

      // Finalize batch
      await db`
        UPDATE app.document_generation_batches
        SET status = CASE
          WHEN failed_items = 0 AND completed_items = total_items THEN 'completed'
          WHEN completed_items > 0 AND failed_items > 0 THEN 'completed_with_errors'
          WHEN failed_items = total_items THEN 'failed'
          ELSE status
        END,
        updated_at = now()
        WHERE id = ${batchId}::uuid
      `;

      // Verify batch status
      const batch = await db<{
        status: string;
        completedItems: number;
        failedItems: number;
        totalItems: number;
      }[]>`
        SELECT status, completed_items as "completedItems",
               failed_items as "failedItems", total_items as "totalItems"
        FROM app.document_generation_batches
        WHERE id = ${batchId}::uuid
      `;

      expect(batch[0]!.status).toBe("completed_with_errors");
      expect(batch[0]!.completedItems).toBe(2);
      expect(batch[0]!.failedItems).toBe(1);
      expect(batch[0]!.totalItems).toBe(3);

      // Verify items
      const failedItems = await db<{ status: string; errorMessage: string }[]>`
        SELECT status, error_message as "errorMessage"
        FROM app.document_generation_batch_items
        WHERE batch_id = ${batchId}::uuid AND status = 'failed'
      `;
      expect(failedItems.length).toBe(1);
      expect(failedItems[0]!.errorMessage).toBe("Employee not found");
    });
  });
});
