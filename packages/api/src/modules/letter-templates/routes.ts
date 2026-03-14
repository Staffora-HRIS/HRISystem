/**
 * Letter Templates Module - Elysia Routes
 *
 * Defines the API endpoints for letter template operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - letter_templates: read, write
 * - generated_letters: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { LetterTemplatesRepository } from "./repository";
import { LetterTemplatesService } from "./service";
import {
  CreateLetterTemplateSchema,
  UpdateLetterTemplateSchema,
  LetterTemplateResponseSchema,
  LetterTemplateFiltersSchema,
  GenerateLetterSchema,
  GeneratedLetterResponseSchema,
  GeneratedLetterFiltersSchema,
  PaginationQuerySchema,
  PaginatedResponseSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateLetterTemplate,
  type GenerateLetter,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & LetterTemplatesPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface LetterTemplatesPluginContext {
  letterTemplatesService: LetterTemplatesService;
  letterTemplatesRepository: LetterTemplatesRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes beyond the shared base set
 */
const letterTemplateErrorStatusMap: Record<string, number> = {
  DUPLICATE_NAME: 409,
  TEMPLATE_INACTIVE: 400,
  MISSING_PLACEHOLDERS: 400,
};

/**
 * Create letter template routes plugin
 */
export const letterTemplateRoutes = new Elysia({
  prefix: "/letter-templates",
  name: "letter-template-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new LetterTemplatesRepository(db);
    const service = new LetterTemplatesService(repository, db);

    return { letterTemplatesService: service, letterTemplatesRepository: repository };
  })

  // ===========================================================================
  // Template CRUD
  // ===========================================================================

  // GET /letter-templates/templates - List templates
  .get(
    "/templates",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, query, set } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const { cursor, limit, ...filters } = query;
        const parsedLimit = limit !== undefined ? Number(limit) : undefined;
        const result = await letterTemplatesService.listTemplates(
          tenantContext,
          filters,
          { cursor, limit: parsedLimit }
        );
        return result;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("letter_templates", "read")],
      query: t.Intersect([PaginationQuerySchema, LetterTemplateFiltersSchema]),
      response: {
        200: PaginatedResponseSchema(LetterTemplateResponseSchema),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "List letter templates",
        description: "Returns a paginated list of letter templates with optional filters.",
      },
    }
  )

  // GET /letter-templates/templates/:id - Get template by ID
  .get(
    "/templates/:id",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, params, set } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const result = await letterTemplatesService.getTemplate(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, letterTemplateErrorStatusMap);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("letter_templates", "read")],
      params: IdParamsSchema,
      response: {
        200: LetterTemplateResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "Get letter template",
        description: "Returns a single letter template by ID.",
      },
    }
  )

  // POST /letter-templates/templates - Create template
  .post(
    "/templates",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, body, set, audit, headers } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const idempotencyKey = headers?.["idempotency-key"];
        const result = await letterTemplatesService.createTemplate(
          tenantContext,
          body as CreateLetterTemplate,
          idempotencyKey
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, letterTemplateErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "letter_templates.template.created",
            resourceType: "letter_template",
            resourceId: result.data!.id,
            newValues: result.data,
          });
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("letter_templates", "write")],
      body: CreateLetterTemplateSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: LetterTemplateResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "Create letter template",
        description: "Creates a new letter template with {{placeholder}} syntax in body_template.",
      },
    }
  )

  // PATCH /letter-templates/templates/:id - Update template
  .patch(
    "/templates/:id",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, params, body, set, audit, headers } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const idempotencyKey = headers?.["idempotency-key"];
        const result = await letterTemplatesService.updateTemplate(
          tenantContext,
          params.id,
          body,
          idempotencyKey
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, letterTemplateErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "letter_templates.template.updated",
            resourceType: "letter_template",
            resourceId: result.data!.id,
            newValues: result.data,
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("letter_templates", "write")],
      params: IdParamsSchema,
      body: UpdateLetterTemplateSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: LetterTemplateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "Update letter template",
        description: "Updates an existing letter template. Bumps the version number automatically.",
      },
    }
  )

  // ===========================================================================
  // Letter Generation
  // ===========================================================================

  // POST /letter-templates/templates/:id/generate - Generate letter from template
  .post(
    "/templates/:id/generate",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, params, body, set, audit, headers } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const idempotencyKey = headers?.["idempotency-key"];
        const result = await letterTemplatesService.generateLetter(
          tenantContext,
          params.id,
          body as GenerateLetter,
          idempotencyKey
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, letterTemplateErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "letter_templates.letter.generated",
            resourceType: "generated_letter",
            resourceId: result.data!.id,
            newValues: {
              template_id: result.data!.template_id,
              employee_id: result.data!.employee_id,
            },
          });
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("generated_letters", "write")],
      params: IdParamsSchema,
      body: GenerateLetterSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: GeneratedLetterResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "Generate letter from template",
        description:
          "Renders a letter template for a specific employee. Employee data is auto-resolved; explicit placeholder_values override auto-resolved values.",
      },
    }
  )

  // ===========================================================================
  // Generated Letters
  // ===========================================================================

  // GET /letter-templates/generated - List generated letters
  .get(
    "/generated",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, query, set } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const { cursor, limit, ...filters } = query;
        const parsedLimit = limit !== undefined ? Number(limit) : undefined;
        const result = await letterTemplatesService.listGeneratedLetters(
          tenantContext,
          filters,
          { cursor, limit: parsedLimit }
        );
        return result;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("generated_letters", "read")],
      query: t.Intersect([PaginationQuerySchema, GeneratedLetterFiltersSchema]),
      response: {
        200: PaginatedResponseSchema(GeneratedLetterResponseSchema),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "List generated letters",
        description: "Returns a paginated list of generated letters with optional filters.",
      },
    }
  )

  // GET /letter-templates/generated/:id - Get generated letter by ID
  .get(
    "/generated/:id",
    async (ctx) => {
      const { letterTemplatesService, tenantContext, params, set } = ctx as typeof ctx & LetterTemplatesPluginContext;

      try {
        const result = await letterTemplatesService.getGeneratedLetter(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, letterTemplateErrorStatusMap);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("generated_letters", "read")],
      params: IdParamsSchema,
      response: {
        200: GeneratedLetterResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Letter Templates"],
        summary: "Get generated letter",
        description: "Returns a single generated letter by ID.",
      },
    }
  );

export type LetterTemplateRoutes = typeof letterTemplateRoutes;
