/**
 * Letter Templates Module - Repository Layer
 *
 * Provides data access methods for letter templates and generated letters.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateLetterTemplate,
  UpdateLetterTemplate,
  LetterTemplateFilters,
  GeneratedLetterFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Letter template database row
 */
export interface LetterTemplateRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  templateType: string;
  subject: string | null;
  bodyTemplate: string;
  placeholders: unknown[];
  isDefault: boolean;
  version: number;
  active: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generated letter database row
 */
export interface GeneratedLetterRow extends Row {
  id: string;
  tenantId: string;
  templateId: string;
  employeeId: string;
  generatedBy: string | null;
  generatedAt: Date;
  subject: string | null;
  body: string;
  placeholdersUsed: Record<string, string>;
  pdfFileKey: string | null;
  sentAt: Date | null;
  sentVia: string | null;
  acknowledgedAt: Date | null;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

// =============================================================================
// Letter Templates Repository
// =============================================================================

export class LetterTemplatesRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Letter Template Methods
  // ===========================================================================

  /**
   * Find letter templates with filters and pagination
   */
  async findTemplates(
    context: TenantContext,
    filters: LetterTemplateFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<LetterTemplateRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LetterTemplateRow[]>`
        SELECT
          id, tenant_id, name, template_type, subject,
          body_template, placeholders, is_default, version,
          active, created_by, created_at, updated_at
        FROM app.letter_templates
        WHERE 1=1
          ${filters.template_type ? tx`AND template_type = ${filters.template_type}` : tx``}
          ${filters.active !== undefined ? tx`AND active = ${filters.active}` : tx``}
          ${filters.is_default !== undefined ? tx`AND is_default = ${filters.is_default}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR subject ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY name, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find letter template by ID
   */
  async findTemplateById(
    context: TenantContext,
    id: string
  ): Promise<LetterTemplateRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LetterTemplateRow[]>`
        SELECT
          id, tenant_id, name, template_type, subject,
          body_template, placeholders, is_default, version,
          active, created_by, created_at, updated_at
        FROM app.letter_templates
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find template by name within a tenant (for duplicate check)
   */
  async findTemplateByName(
    context: TenantContext,
    name: string
  ): Promise<LetterTemplateRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LetterTemplateRow[]>`
        SELECT
          id, tenant_id, name, template_type, subject,
          body_template, placeholders, is_default, version,
          active, created_by, created_at, updated_at
        FROM app.letter_templates
        WHERE name = ${name}
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create letter template
   */
  async createTemplate(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateLetterTemplate,
    createdBy: string
  ): Promise<LetterTemplateRow> {
    const rows = await tx<LetterTemplateRow[]>`
      INSERT INTO app.letter_templates (
        tenant_id, name, template_type, subject,
        body_template, placeholders, is_default, created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.template_type},
        ${data.subject || null},
        ${data.body_template},
        ${JSON.stringify(data.placeholders || [])}::jsonb,
        ${data.is_default || false},
        ${createdBy}::uuid
      )
      RETURNING
        id, tenant_id, name, template_type, subject,
        body_template, placeholders, is_default, version,
        active, created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update letter template (bumps version)
   */
  async updateTemplate(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateLetterTemplate
  ): Promise<LetterTemplateRow> {
    const rows = await tx<LetterTemplateRow[]>`
      UPDATE app.letter_templates
      SET
        name = COALESCE(${data.name ?? null}, name),
        template_type = COALESCE(${data.template_type ?? null}, template_type),
        subject = CASE
          WHEN ${data.subject !== undefined} THEN ${data.subject ?? null}
          ELSE subject
        END,
        body_template = COALESCE(${data.body_template ?? null}, body_template),
        placeholders = CASE
          WHEN ${data.placeholders !== undefined} THEN ${data.placeholders ? JSON.stringify(data.placeholders) : null}::jsonb
          ELSE placeholders
        END,
        is_default = COALESCE(${data.is_default ?? null}, is_default),
        active = COALESCE(${data.active ?? null}, active),
        version = version + 1,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, template_type, subject,
        body_template, placeholders, is_default, version,
        active, created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Clear default flag for all templates of a given type within a tenant
   */
  async clearDefaultForType(
    tx: TransactionSql,
    _context: TenantContext,
    templateType: string,
    excludeId?: string
  ): Promise<void> {
    if (excludeId) {
      await tx`
        UPDATE app.letter_templates
        SET is_default = false, updated_at = now()
        WHERE template_type = ${templateType}
          AND is_default = true
          AND id != ${excludeId}::uuid
      `;
    } else {
      await tx`
        UPDATE app.letter_templates
        SET is_default = false, updated_at = now()
        WHERE template_type = ${templateType}
          AND is_default = true
      `;
    }
  }

  // ===========================================================================
  // Generated Letter Methods
  // ===========================================================================

  /**
   * Find generated letters with filters and pagination
   */
  async findGeneratedLetters(
    context: TenantContext,
    filters: GeneratedLetterFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<GeneratedLetterRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<GeneratedLetterRow[]>`
        SELECT
          gl.id, gl.tenant_id, gl.template_id, gl.employee_id,
          gl.generated_by, gl.generated_at, gl.subject, gl.body,
          gl.placeholders_used, gl.pdf_file_key,
          gl.sent_at, gl.sent_via, gl.acknowledged_at
        FROM app.generated_letters gl
        WHERE 1=1
          ${filters.employee_id ? tx`AND gl.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.template_id ? tx`AND gl.template_id = ${filters.template_id}::uuid` : tx``}
          ${filters.template_type ? tx`AND EXISTS (
            SELECT 1 FROM app.letter_templates lt
            WHERE lt.id = gl.template_id AND lt.template_type = ${filters.template_type}
          )` : tx``}
          ${filters.search ? tx`AND (gl.subject ILIKE ${"%" + filters.search + "%"} OR gl.body ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND gl.id > ${cursor}::uuid` : tx``}
        ORDER BY gl.generated_at DESC, gl.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find generated letter by ID
   */
  async findGeneratedLetterById(
    context: TenantContext,
    id: string
  ): Promise<GeneratedLetterRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<GeneratedLetterRow[]>`
        SELECT
          id, tenant_id, template_id, employee_id,
          generated_by, generated_at, subject, body,
          placeholders_used, pdf_file_key,
          sent_at, sent_via, acknowledged_at
        FROM app.generated_letters
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create generated letter
   */
  async createGeneratedLetter(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      templateId: string;
      employeeId: string;
      generatedBy: string;
      subject: string | null;
      body: string;
      placeholdersUsed: Record<string, string>;
    }
  ): Promise<GeneratedLetterRow> {
    const rows = await tx<GeneratedLetterRow[]>`
      INSERT INTO app.generated_letters (
        tenant_id, template_id, employee_id, generated_by,
        subject, body, placeholders_used
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.templateId}::uuid,
        ${data.employeeId}::uuid,
        ${data.generatedBy}::uuid,
        ${data.subject},
        ${data.body},
        ${JSON.stringify(data.placeholdersUsed)}::jsonb
      )
      RETURNING
        id, tenant_id, template_id, employee_id,
        generated_by, generated_at, subject, body,
        placeholders_used, pdf_file_key,
        sent_at, sent_via, acknowledged_at
    `;

    return rows[0]!;
  }

  /**
   * Fetch employee data for placeholder rendering.
   * Returns a flat record of commonly-used fields.
   */
  async getEmployeeForRendering(
    context: TenantContext,
    employeeId: string
  ): Promise<Record<string, string> | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<Record<string, unknown>[]>`
        SELECT
          e.id,
          e.employee_number,
          e.status,
          e.hire_date,
          ep.first_name,
          ep.last_name,
          ep.middle_name,
          ep.preferred_name,
          ep.date_of_birth,
          ep.gender,
          ep.nationality,
          ec.contract_type,
          ec.employment_type,
          ec.fte,
          ec.working_hours_per_week,
          ec.probation_end_date,
          ec.notice_period_days,
          pa.position_id,
          p.title    AS position_title,
          p.code     AS position_code,
          ou.name    AS org_unit_name,
          ou.code    AS org_unit_code,
          comp.base_salary,
          comp.currency,
          comp.pay_frequency,
          mgr_emp.employee_number AS manager_employee_number,
          mgr_personal.first_name AS manager_first_name,
          mgr_personal.last_name  AS manager_last_name
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id AND ep.effective_to IS NULL
        LEFT JOIN app.employee_contracts ec
          ON ec.employee_id = e.id AND ec.effective_to IS NULL
        LEFT JOIN app.position_assignments pa
          ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
        LEFT JOIN app.positions p
          ON p.id = pa.position_id
        LEFT JOIN app.org_units ou
          ON ou.id = pa.org_unit_id
        LEFT JOIN app.compensation comp
          ON comp.employee_id = e.id AND comp.effective_to IS NULL
        LEFT JOIN app.reporting_lines rl
          ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
        LEFT JOIN app.employees mgr_emp
          ON mgr_emp.id = rl.manager_id
        LEFT JOIN app.employee_personal mgr_personal
          ON mgr_personal.employee_id = mgr_emp.id AND mgr_personal.effective_to IS NULL
        WHERE e.id = ${employeeId}::uuid
      `;
      return rows;
    });

    if (!result[0]) return null;

    const row = result[0];

    // Build a flat string map for template rendering
    const map: Record<string, string> = {};
    const safeStr = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().split("T")[0]!;
      return String(val);
    };

    map["employee_number"] = safeStr(row.employeeNumber);
    map["first_name"] = safeStr(row.firstName);
    map["last_name"] = safeStr(row.lastName);
    map["full_name"] = [row.firstName, row.lastName].filter(Boolean).join(" ");
    map["middle_name"] = safeStr(row.middleName);
    map["preferred_name"] = safeStr(row.preferredName);
    map["date_of_birth"] = safeStr(row.dateOfBirth);
    map["gender"] = safeStr(row.gender);
    map["nationality"] = safeStr(row.nationality);
    map["hire_date"] = safeStr(row.hireDate);
    map["status"] = safeStr(row.status);
    map["contract_type"] = safeStr(row.contractType);
    map["employment_type"] = safeStr(row.employmentType);
    map["fte"] = safeStr(row.fte);
    map["working_hours_per_week"] = safeStr(row.workingHoursPerWeek);
    map["probation_end_date"] = safeStr(row.probationEndDate);
    map["notice_period_days"] = safeStr(row.noticePeriodDays);
    map["position_title"] = safeStr(row.positionTitle);
    map["position_code"] = safeStr(row.positionCode);
    map["org_unit_name"] = safeStr(row.orgUnitName);
    map["org_unit_code"] = safeStr(row.orgUnitCode);
    map["base_salary"] = safeStr(row.baseSalary);
    map["currency"] = safeStr(row.currency);
    map["pay_frequency"] = safeStr(row.payFrequency);
    map["manager_name"] = [row.managerFirstName, row.managerLastName].filter(Boolean).join(" ");
    map["manager_employee_number"] = safeStr(row.managerEmployeeNumber);
    map["today_date"] = new Date().toISOString().split("T")[0]!;
    map["current_year"] = String(new Date().getFullYear());

    return map;
  }
}
