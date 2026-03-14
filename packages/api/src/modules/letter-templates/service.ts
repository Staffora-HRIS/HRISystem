/**
 * Letter Templates Module - Service Layer
 *
 * Implements business logic for letter template operations.
 * Handles template rendering with {{placeholder}} replacement,
 * validates required placeholders, and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  LetterTemplatesRepository,
  LetterTemplateRow,
  GeneratedLetterRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateLetterTemplate,
  UpdateLetterTemplate,
  LetterTemplateFilters,
  GenerateLetter,
  GeneratedLetterFilters,
  PaginationQuery,
  LetterTemplateResponse,
  GeneratedLetterResponse,
  PlaceholderDef,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "letter_templates.template.created"
  | "letter_templates.template.updated"
  | "letter_templates.letter.generated";

// =============================================================================
// Letter Templates Service
// =============================================================================

export class LetterTemplatesService {
  constructor(
    private repository: LetterTemplatesRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Template Business Logic
  // ===========================================================================

  /**
   * List letter templates with filters
   */
  async listTemplates(
    context: TenantContext,
    filters: LetterTemplateFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<LetterTemplateResponse>> {
    const result = await this.repository.findTemplates(context, filters, pagination);

    return {
      items: result.items.map(this.mapTemplateToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get letter template by ID
   */
  async getTemplate(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<LetterTemplateResponse>> {
    const template = await this.repository.findTemplateById(context, id);

    if (!template) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Letter template not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapTemplateToResponse(template),
    };
  }

  /**
   * Create letter template
   */
  async createTemplate(
    context: TenantContext,
    data: CreateLetterTemplate,
    _idempotencyKey?: string
  ): Promise<ServiceResult<LetterTemplateResponse>> {
    // Check for duplicate name
    const existing = await this.repository.findTemplateByName(context, data.name);
    if (existing) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_NAME",
          message: "A letter template with this name already exists",
          details: { name: data.name },
        },
      };
    }

    // Validate placeholders match body_template
    const bodyPlaceholders = this.extractPlaceholders(data.body_template);
    const subjectPlaceholders = data.subject ? this.extractPlaceholders(data.subject) : [];
    const allUsedPlaceholders = [...new Set([...bodyPlaceholders, ...subjectPlaceholders])];

    // Auto-populate placeholders array if not provided
    if (!data.placeholders || data.placeholders.length === 0) {
      data.placeholders = allUsedPlaceholders.map((key) => ({
        key,
        description: `Value for ${key}`,
        required: true,
      }));
    }

    // Create template in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      // If this template is set as default, clear other defaults for this type
      if (data.is_default) {
        await this.repository.clearDefaultForType(tx, context, data.template_type);
      }

      const template = await this.repository.createTemplate(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "letter_template", template.id, "letter_templates.template.created", {
        template: this.mapTemplateToResponse(template),
      });

      return template;
    });

    return {
      success: true,
      data: this.mapTemplateToResponse(result),
    };
  }

  /**
   * Update letter template
   */
  async updateTemplate(
    context: TenantContext,
    id: string,
    data: UpdateLetterTemplate,
    _idempotencyKey?: string
  ): Promise<ServiceResult<LetterTemplateResponse>> {
    // Check template exists
    const existing = await this.repository.findTemplateById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Letter template not found",
          details: { id },
        },
      };
    }

    // Check duplicate name if name is being changed
    if (data.name && data.name !== existing.name) {
      const nameConflict = await this.repository.findTemplateByName(context, data.name);
      if (nameConflict) {
        return {
          success: false,
          error: {
            code: "DUPLICATE_NAME",
            message: "A letter template with this name already exists",
            details: { name: data.name },
          },
        };
      }
    }

    // Update in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      // If setting as default, clear other defaults for this type
      if (data.is_default === true) {
        const templateType = data.template_type || existing.templateType;
        await this.repository.clearDefaultForType(tx, context, templateType, id);
      }

      const template = await this.repository.updateTemplate(tx, context, id, data);

      // Emit event
      await this.emitEvent(tx, context, "letter_template", template.id, "letter_templates.template.updated", {
        template: this.mapTemplateToResponse(template),
        changes: data,
      });

      return template;
    });

    return {
      success: true,
      data: this.mapTemplateToResponse(result),
    };
  }

  // ===========================================================================
  // Letter Generation Business Logic
  // ===========================================================================

  /**
   * Generate a letter from a template for an employee.
   *
   * 1. Loads the template
   * 2. Loads employee data for automatic placeholder resolution
   * 3. Merges explicit placeholder_values from request body over auto-resolved values
   * 4. Validates all required placeholders are provided
   * 5. Renders subject and body
   * 6. Writes generated_letters row + outbox event in the same transaction
   */
  async generateLetter(
    context: TenantContext,
    templateId: string,
    data: GenerateLetter,
    _idempotencyKey?: string
  ): Promise<ServiceResult<GeneratedLetterResponse>> {
    // Load template
    const template = await this.repository.findTemplateById(context, templateId);
    if (!template) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Letter template not found",
          details: { template_id: templateId },
        },
      };
    }

    if (!template.active) {
      return {
        success: false,
        error: {
          code: "TEMPLATE_INACTIVE",
          message: "Cannot generate letter from inactive template",
          details: { template_id: templateId },
        },
      };
    }

    // Load employee data for automatic placeholder resolution
    const employeeData = await this.repository.getEmployeeForRendering(
      context,
      data.employee_id
    );

    if (!employeeData) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    // Merge: explicit values override auto-resolved employee data
    const mergedValues: Record<string, string> = {
      ...employeeData,
      ...(data.placeholder_values || {}),
    };

    // Validate required placeholders
    const placeholderDefs = (template.placeholders || []) as PlaceholderDef[];
    const missingRequired: string[] = [];

    for (const def of placeholderDefs) {
      if (def.required !== false) {
        const value = mergedValues[def.key];
        if (value === undefined || value === "") {
          // Check if there is a default_value
          if (def.default_value !== undefined) {
            mergedValues[def.key] = def.default_value;
          } else {
            missingRequired.push(def.key);
          }
        }
      }
    }

    if (missingRequired.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Missing required placeholder values",
          details: { missing: missingRequired },
        },
      };
    }

    // Render subject and body
    const renderedSubject = template.subject
      ? this.renderTemplate(template.subject, mergedValues)
      : null;
    const renderedBody = this.renderTemplate(template.bodyTemplate, mergedValues);

    // Create generated letter in transaction (with outbox event)
    const result = await this.db.withTransaction(context, async (tx) => {
      const generatedLetter = await this.repository.createGeneratedLetter(tx, context, {
        templateId: template.id,
        employeeId: data.employee_id,
        generatedBy: context.userId || "system",
        subject: renderedSubject,
        body: renderedBody,
        placeholdersUsed: mergedValues,
      });

      // Emit event
      await this.emitEvent(
        tx,
        context,
        "generated_letter",
        generatedLetter.id,
        "letter_templates.letter.generated",
        {
          generatedLetterId: generatedLetter.id,
          templateId: template.id,
          templateName: template.name,
          employeeId: data.employee_id,
        }
      );

      return generatedLetter;
    });

    return {
      success: true,
      data: this.mapGeneratedLetterToResponse(result),
    };
  }

  /**
   * List generated letters
   */
  async listGeneratedLetters(
    context: TenantContext,
    filters: GeneratedLetterFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<GeneratedLetterResponse>> {
    const result = await this.repository.findGeneratedLetters(context, filters, pagination);

    return {
      items: result.items.map(this.mapGeneratedLetterToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get generated letter by ID
   */
  async getGeneratedLetter(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<GeneratedLetterResponse>> {
    const letter = await this.repository.findGeneratedLetterById(context, id);

    if (!letter) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Generated letter not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapGeneratedLetterToResponse(letter),
    };
  }

  // ===========================================================================
  // Template Rendering
  // ===========================================================================

  /**
   * Extract placeholder keys from a template string.
   * Finds all {{key}} patterns.
   */
  private extractPlaceholders(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = regex.exec(template)) !== null) {
      if (match[1] && !placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }
    return placeholders;
  }

  /**
   * Render a template string by replacing {{key}} placeholders with values.
   * Unresolved placeholders are left as-is.
   */
  private renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return values[key] !== undefined ? values[key] : `{{${key}}}`;
    });
  }

  // ===========================================================================
  // Mappers
  // ===========================================================================

  /**
   * Map database row to API response
   */
  private mapTemplateToResponse = (row: LetterTemplateRow): LetterTemplateResponse => ({
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    template_type: row.templateType as LetterTemplateResponse["template_type"],
    subject: row.subject,
    body_template: row.bodyTemplate,
    placeholders: (row.placeholders || []) as PlaceholderDef[],
    is_default: row.isDefault,
    version: row.version,
    active: row.active,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  });

  /**
   * Map generated letter database row to API response
   */
  private mapGeneratedLetterToResponse = (row: GeneratedLetterRow): GeneratedLetterResponse => ({
    id: row.id,
    tenant_id: row.tenantId,
    template_id: row.templateId,
    employee_id: row.employeeId,
    generated_by: row.generatedBy,
    generated_at: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : String(row.generatedAt),
    subject: row.subject,
    body: row.body,
    placeholders_used: (row.placeholdersUsed || {}) as Record<string, string>,
    pdf_file_key: row.pdfFileKey,
    sent_at: row.sentAt instanceof Date ? row.sentAt.toISOString() : row.sentAt ? String(row.sentAt) : null,
    sent_via: row.sentVia as GeneratedLetterResponse["sent_via"],
    acknowledged_at: row.acknowledgedAt instanceof Date ? row.acknowledgedAt.toISOString() : row.acknowledgedAt ? String(row.acknowledgedAt) : null,
  });
}
