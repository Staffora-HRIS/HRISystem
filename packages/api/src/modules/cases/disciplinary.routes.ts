/**
 * Disciplinary & Grievance Module Routes
 *
 * ACAS Code of Practice compliant disciplinary and grievance workflow.
 * Nested under /cases/:id/disciplinary to link to parent HR case.
 *
 * Routes:
 *   POST   /cases/:id/disciplinary              — Create disciplinary/grievance case
 *   GET    /cases/:id/disciplinary              — Get disciplinary details
 *   PATCH  /cases/:id/disciplinary/investigation — Record investigation findings
 *   POST   /cases/:id/disciplinary/hearing       — Schedule hearing (5 WD notice)
 *   PATCH  /cases/:id/disciplinary/hearing-notes — Record hearing notes
 *   PATCH  /cases/:id/disciplinary/decision      — Record decision + appeal deadline
 *   POST   /cases/:id/disciplinary/appeal        — Submit appeal within window
 *   PATCH  /cases/:id/disciplinary/appeal-outcome — Record appeal outcome
 *   GET    /cases/:id/disciplinary/compliance    — ACAS compliance check
 *   PATCH  /cases/:id/disciplinary/informal-resolution — Record informal resolution (grievance)
 *   POST   /cases/:id/disciplinary/advance-investigation — Advance grievance to investigation
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { DatabaseClient } from "../../plugins/db";
import { DisciplinaryRepository } from "./disciplinary.repository";
import { DisciplinaryService } from "./disciplinary.service";
import { CasesRepository } from "./repository";
import { mapErrorToStatus } from "../../lib/route-helpers";
import {
  CreateDisciplinaryCaseSchema,
  RecordInvestigationSchema,
  ScheduleHearingSchema,
  RecordHearingSchema,
  RecordDecisionSchema,
  SubmitAppealSchema,
  RecordAppealOutcomeSchema,
  RecordInformalResolutionSchema,
} from "./disciplinary.schemas";
import type {
  CreateDisciplinaryCase,
  RecordInvestigation,
  ScheduleHearing,
  RecordHearing,
  RecordDecision,
  SubmitAppeal,
  RecordAppealOutcome,
  RecordInformalResolution,
} from "./disciplinary.schemas";

const UuidSchema = t.String({ format: "uuid" });

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

/** Elysia context shape after derive injects service and context */
interface DerivedContext {
  disciplinaryService: DisciplinaryService;
  tenantContext: { tenantId: string; userId: string | undefined };
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

/** Module-specific error code overrides for HTTP status mapping */
const DISCIPLINARY_ERROR_CODES: Record<string, number> = {
  ACAS_NOTICE_PERIOD: 422,
  APPEAL_WINDOW_EXPIRED: 422,
  STATE_MACHINE_VIOLATION: 409,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
};

export const disciplinaryRoutes = new Elysia({ prefix: "/cases" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const disciplinaryRepo = new DisciplinaryRepository(db);
    const casesRepo = new CasesRepository(db);
    const service = new DisciplinaryService(disciplinaryRepo, casesRepo, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { disciplinaryService: service, tenantContext };
  })

  // =========================================================================
  // POST /cases/:id/disciplinary — Create disciplinary/grievance case
  // =========================================================================
  .post("/:id/disciplinary", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.createDisciplinaryCase(
      tenantContext,
      params.id,
      body as CreateDisciplinaryCase
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: CreateDisciplinaryCaseSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Create ACAS disciplinary/grievance case",
      description: "Creates a disciplinary or grievance case linked to an existing HR case. Disciplinary starts at investigation stage; grievance starts at informal resolution.",
    },
  })

  // =========================================================================
  // GET /cases/:id/disciplinary — Get disciplinary case details
  // =========================================================================
  .get("/:id/disciplinary", async (ctx) => {
    const { disciplinaryService, tenantContext, params, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.getDisciplinaryCase(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: {
      tags: ["Cases"],
      summary: "Get disciplinary/grievance case details",
      description: "Returns the full disciplinary/grievance case details including investigation, hearing, decision, and appeal information.",
    },
  })

  // =========================================================================
  // PATCH /cases/:id/disciplinary/investigation — Record investigation
  // =========================================================================
  .patch("/:id/disciplinary/investigation", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.recordInvestigation(
      tenantContext,
      params.id,
      body as RecordInvestigation
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: RecordInvestigationSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Record investigation findings",
      description: "Records investigation findings and evidence. Advances the case to notification (disciplinary) or hearing (grievance) stage. ACAS Code para 5.",
    },
  })

  // =========================================================================
  // POST /cases/:id/disciplinary/hearing — Schedule hearing
  // =========================================================================
  .post("/:id/disciplinary/hearing", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.scheduleHearing(
      tenantContext,
      params.id,
      body as ScheduleHearing
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: ScheduleHearingSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Schedule disciplinary/grievance hearing",
      description: "Schedules a hearing with minimum 5 working days notice (ACAS Code para 12). Sends written notification to the employee with hearing details.",
    },
  })

  // =========================================================================
  // PATCH /cases/:id/disciplinary/hearing-notes — Record hearing
  // =========================================================================
  .patch("/:id/disciplinary/hearing-notes", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.recordHearing(
      tenantContext,
      params.id,
      body as RecordHearing
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: RecordHearingSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Record hearing notes and companion details",
      description: "Records hearing notes, attendance, and companion details (right to be accompanied per s.10 TULRCA 1992, ACAS Code para 14). Advances to decision stage.",
    },
  })

  // =========================================================================
  // PATCH /cases/:id/disciplinary/decision — Record decision
  // =========================================================================
  .patch("/:id/disciplinary/decision", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.recordDecision(
      tenantContext,
      params.id,
      body as RecordDecision
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: RecordDecisionSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Record disciplinary/grievance decision",
      description: "Records the outcome decision with written reasons (ACAS Code para 19). Automatically calculates 5 working day appeal deadline (ACAS Code para 26).",
    },
  })

  // =========================================================================
  // POST /cases/:id/disciplinary/appeal — Submit appeal
  // =========================================================================
  .post("/:id/disciplinary/appeal", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.submitAppeal(
      tenantContext,
      params.id,
      body as SubmitAppeal
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: SubmitAppealSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Submit appeal against decision",
      description: "Submits an appeal within the appeal window (5 working days from decision). ACAS Code para 26. Returns 422 if the appeal window has expired.",
    },
  })

  // =========================================================================
  // PATCH /cases/:id/disciplinary/appeal-outcome — Record appeal outcome
  // =========================================================================
  .patch("/:id/disciplinary/appeal-outcome", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.recordAppealOutcome(
      tenantContext,
      params.id,
      body as RecordAppealOutcome
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: RecordAppealOutcomeSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Record appeal outcome",
      description: "Records the appeal outcome. Must be heard by a different, more senior manager (ACAS Code para 27). Closes the case.",
    },
  })

  // =========================================================================
  // GET /cases/:id/disciplinary/compliance — ACAS compliance check
  // =========================================================================
  .get("/:id/disciplinary/compliance", async (ctx) => {
    const { disciplinaryService, tenantContext, params, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.getAcasCompliance(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "read")],
    detail: {
      tags: ["Cases"],
      summary: "ACAS compliance check",
      description: "Returns a compliance assessment showing which ACAS Code steps have been followed, which are missing, and risk areas that could lead to a 25% tribunal award uplift.",
    },
  })

  // =========================================================================
  // PATCH /cases/:id/disciplinary/informal-resolution — Record informal resolution (grievance)
  // =========================================================================
  .patch("/:id/disciplinary/informal-resolution", async (ctx) => {
    const { disciplinaryService, tenantContext, params, body, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.recordInformalResolution(
      tenantContext,
      params.id,
      body as RecordInformalResolution
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: RecordInformalResolutionSchema,
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Record informal resolution attempt (grievance only)",
      description: "Records an informal resolution attempt for a grievance case (ACAS Code para 32). If resolved, closes the case. If not, advances to formal submission.",
    },
  })

  // =========================================================================
  // POST /cases/:id/disciplinary/advance-investigation — Advance grievance
  // =========================================================================
  .post("/:id/disciplinary/advance-investigation", async (ctx) => {
    const { disciplinaryService, tenantContext, params, set } =
      ctx as unknown as DerivedContext;

    const result = await disciplinaryService.advanceGrievanceToInvestigation(
      tenantContext,
      params.id
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, DISCIPLINARY_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("cases", "write")],
    detail: {
      tags: ["Cases"],
      summary: "Advance grievance to investigation stage",
      description: "Advances a grievance case from formal submission to investigation stage. Acknowledges receipt of formal grievance and commences investigation.",
    },
  });

export type DisciplinaryRoutes = typeof disciplinaryRoutes;
