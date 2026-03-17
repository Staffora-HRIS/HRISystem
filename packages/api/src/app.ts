/**
 * Staffora Platform API Entry Point
 *
 * This is the main entry point for the Staffora API server.
 * It initializes Elysia with all required plugins and starts the server.
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

// Import plugins
import {
  dbPlugin,
  cachePlugin,
  errorsPlugin,
  rateLimitPlugin,
  securityHeadersPlugin,
  tenantPlugin,
  authPlugin,
  rbacPlugin,
  idempotencyPlugin,
  auditPlugin,
  betterAuthPlugin,
} from "./plugins";
import { ErrorCodes } from "./plugins/errors";
import { metricsPlugin } from "./plugins/metrics";

// Import modules
import { hrRoutes } from "./modules/hr";
import { timeRoutes } from "./modules/time";
import { absenceRoutes } from "./modules/absence";
import { authRoutes } from "./modules/auth";
import { portalRoutes } from "./modules/portal";
import { workflowRoutes } from "./modules/workflows";
import { talentRoutes } from "./modules/talent";
import { talentPoolRoutes } from "./modules/talent-pools";
import { feedback360Routes } from "./modules/feedback-360";
import { lmsRoutes } from "./modules/lms";
import { casesRoutes } from "./modules/cases";
import { onboardingRoutes } from "./modules/onboarding";
import { tenantRoutes } from "./modules/tenant";
import {
  securityRoutes,
  fieldPermissionRoutes,
  portalRoutes as securityPortalRoutes,
  managerRoutes,
} from "./modules/security";
import { dashboardRoutes } from "./modules/dashboard";
import { systemRoutes } from "./modules/system";
import { benefitsRoutes } from "./modules/benefits";
import { documentsRoutes } from "./modules/documents";
import { successionRoutes } from "./modules/succession";
import { analyticsRoutes } from "./modules/analytics";
import { competenciesRoutes } from "./modules/competencies";
import { recruitmentRoutes } from "./modules/recruitment";
import { jobBoardRoutes } from "./modules/job-boards";
import { clientPortalRoutes } from "./modules/client-portal";
import { apiKeyRoutes } from "./modules/api-keys";
import { bulkOperationsRoutes } from "./modules/bulk-operations";
import { changeRequestPortalRoutes, changeRequestAdminRoutes } from "./modules/employee-change-requests";
import { bulkDocumentGenerationRoutes } from "./modules/bulk-document-generation";
import { costCentreAssignmentRoutes } from "./modules/cost-centre-assignments";

// UK Compliance & HR modules (Phase 11-15)
import { agencyRoutes } from "./modules/agencies";
import { assessmentRoutes } from "./modules/assessments";
import { bankDetailRoutes } from "./modules/bank-details";
import { bankHolidayRoutes } from "./modules/bank-holidays";
import { bereavementRoutes } from "./modules/bereavement";
import { carersLeaveRoutes } from "./modules/carers-leave";
import { consentRoutes } from "./modules/consent";
import { contractAmendmentRoutes } from "./modules/contract-amendments";
import { contractStatementsRoutes } from "./modules/contract-statements";
import { courseRatingRoutes } from "./modules/course-ratings";
import { cpdRoutes } from "./modules/cpd";
import { dataBreachRoutes } from "./modules/data-breach";
import { dataErasureRoutes } from "./modules/data-erasure";
import { dataRetentionRoutes } from "./modules/data-retention";
import { dbsCheckRoutes } from "./modules/dbs-checks";
import { backgroundCheckRoutes } from "./modules/background-checks";
import { deductionRoutes } from "./modules/deductions";
import { delegationRoutes } from "./modules/delegations";
import { diversityRoutes } from "./modules/diversity";
import { dsarRoutes } from "./modules/dsar";
import { emergencyContactRoutes } from "./modules/emergency-contacts";
import { employeePhotoRoutes } from "./modules/employee-photos";
import { equipmentRoutes } from "./modules/equipment";
import { familyLeaveRoutes } from "./modules/family-leave";
import { flexibleWorkingRoutes } from "./modules/flexible-working";
import { genderPayGapRoutes } from "./modules/gender-pay-gap";
import { geofenceRoutes } from "./modules/geofence";
import { headcountPlanningRoutes } from "./modules/headcount-planning";
import { healthSafetyRoutes } from "./modules/health-safety";
import { jobsRoutes } from "./modules/jobs";
import { letterTemplateRoutes } from "./modules/letter-templates";
import { nmwRoutes } from "./modules/nmw";
import { notificationsRoutes } from "./modules/notifications";
import { parentalLeaveRoutes } from "./modules/parental-leave";
import { payrollRoutes } from "./modules/payroll";
import { payrollConfigRoutes } from "./modules/payroll-config";
import { payslipRoutes } from "./modules/payslips";
import { pensionRoutes } from "./modules/pension";
import { privacyNoticeRoutes } from "./modules/privacy-notices";
import { probationRoutes } from "./modules/probation";
import { reasonableAdjustmentsRoutes } from "./modules/reasonable-adjustments";
import { referenceCheckRoutes } from "./modules/reference-checks";
import { reportsRoutes } from "./modules/reports";
import { returnToWorkRoutes } from "./modules/return-to-work";
import { rightToWorkRoutes } from "./modules/right-to-work";
import { secondmentRoutes } from "./modules/secondments";
import { sspRoutes } from "./modules/ssp";
import { statutoryLeaveRoutes } from "./modules/statutory-leave";
import { taxCodeRoutes } from "./modules/tax-codes";
import { trainingBudgetRoutes } from "./modules/training-budgets";
import { warningsRoutes } from "./modules/warnings";
import { wtrRoutes } from "./modules/wtr";
import { integrationsRoutes } from "./modules/integrations";
import { emailTrackingRoutes } from "./modules/email-tracking";
import { policyDistributionRoutes } from "./modules/policy-distribution";
import { overtimeRequestRoutes } from "./modules/overtime-requests";
import { usageStatsRoutes } from "./modules/usage-stats";
import { salarySacrificeRoutes } from "./modules/salary-sacrifice";
import { lookupValuesRoutes } from "./modules/lookup-values";
import { incomeProtectionRoutes } from "./modules/income-protection";
import { tribunalRoutes } from "./modules/tribunal";
import { globalMobilityRoutes } from "./modules/global-mobility";

import { beneficiaryNominationRoutes } from "./modules/beneficiary-nominations";
import { benefitsExchangeRoutes } from "./modules/benefits-exchange";
import { dataImportRoutes } from "./modules/data-import";
import { calendarSyncRoutes } from "./modules/calendar-sync";
import { dataArchivalRoutes } from "./modules/data-archival";
import { eSignaturesRoutes } from "./modules/e-signatures";
import { ssoAdminRoutes, ssoPublicRoutes } from "./modules/sso";
/**
 * Environment configuration with validation
 */
const config = {
  port: Number(process.env["PORT"]) || 3000,
  nodeEnv: process.env["NODE_ENV"] || "development",
  isProduction: process.env["NODE_ENV"] === "production",
  // CORS origin - comma-separated in env or default dev port
  corsOrigins: process.env["CORS_ORIGIN"]?.split(",").map(s => s.trim()) || [
    "http://localhost:5173",
  ],
  maxBodySize: Number(process.env["MAX_BODY_SIZE"]) || 10 * 1024 * 1024, // 10MB default
} as const;

/** Pre-compiled regex for dev CORS origin check (avoid re-compiling on every request) */
const DEV_LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Application start time for uptime calculation
 */
const startTime = Date.now();

/**
 * Create and configure the Elysia application
 */
export const app = new Elysia()
  // CORS configuration (must be first)
  .use(
    cors({
      origin: config.isProduction
        ? config.corsOrigins // Strict origin check in production
        : (request) => {
            // In development, allow strict localhost/127.0.0.1 origins with any port
            const origin = request.headers.get("origin");
            if (!origin) return true;
            if (DEV_LOCALHOST_REGEX.test(origin)) {
              return true;
            }
            return config.corsOrigins.includes(origin);
          },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-CSRF-Token",
        "X-Tenant-ID",
        "X-Visitor-ID",
        "Idempotency-Key",
        "Cache-Control",
        "Accept",
        "Accept-Language",
      ],
      exposeHeaders: [
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Window",
        "Retry-After",
      ],
      credentials: true,
      maxAge: config.isProduction ? 86400 : 600, // 24h in prod, 10min in dev
      preflight: true,
    })
  )

  // Security headers (after CORS, before other plugins)
  .use(
    securityHeadersPlugin({
      enabled: true,
      enableHSTS: config.isProduction,
      hstsMaxAge: 31536000, // 1 year
      hstsIncludeSubDomains: true,
      hstsPreload: false, // Enable only after testing
      frameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      csp: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline for Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline for Swagger UI
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", ...config.corsOrigins],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction,
      },
    })
  )

  // Swagger documentation
  .use(
    swagger({
      documentation: {
        info: {
          title: "Staffora Platform API",
          version: "0.1.0",
          description: "Enterprise Human Resource Information System API — staffora.co.uk",
        },
        tags: [
          { name: "Health", description: "Health check endpoints" },
          { name: "Auth", description: "Authentication endpoints" },
          { name: "HR", description: "Core HR endpoints" },
          { name: "Time", description: "Time & Attendance endpoints" },
          { name: "Absence", description: "Leave management endpoints" },
          { name: "Talent", description: "Talent management endpoints" },
          { name: "Talent - 360 Feedback", description: "360-degree multi-rater feedback endpoints" },
          { name: "LMS", description: "Learning management endpoints" },
          { name: "Workflows", description: "Workflow endpoints" },
          { name: "Cases", description: "Case management endpoints" },
          { name: "Onboarding", description: "Onboarding endpoints" },
          { name: "Portal", description: "Self-service portal endpoints" },
          { name: "Reports", description: "Reporting & Analytics endpoints" },
          { name: "Security", description: "Security & RBAC endpoints" },
          { name: "Data Import", description: "CSV/Excel bulk data import endpoints" },
          { name: "SSO", description: "Enterprise SSO (SAML/OIDC) configuration and login endpoints" },
        ],
      },
      path: "/docs",
      exclude: ["/docs", "/docs/json"],
    })
  )

  // Core infrastructure plugins (order matters!)
  .use(errorsPlugin())

  // Prometheus metrics (GET /metrics — no auth required for scraping)
  .use(metricsPlugin())

  // Request body size limit (pre-computed at startup, not per-request)
  .onBeforeHandle({ as: "global" }, ({ request, set }) => {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > config.maxBodySize) {
      set.status = 413;
      return {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `Request body exceeds maximum size of ${Math.floor(config.maxBodySize / 1024 / 1024)}MB`,
        },
      };
    }
  })

  .use(dbPlugin())
  .use(cachePlugin())

  .use(rateLimitPlugin())

  // Better Auth routes (mounted before other auth for /api/auth/* endpoints)
  .use(betterAuthPlugin())

  // Health check endpoint (before auth/tenant for accessibility)
  .get(
    "/health",
    async ({ db, cache }) => {
      const dbHealth = await db.healthCheck();
      const redisHealth = await cache.healthCheck();

      const allUp = dbHealth.status === "up" && redisHealth.status === "up";
      const allDown = dbHealth.status === "down" && redisHealth.status === "down";

      const status: "healthy" | "degraded" | "unhealthy" = allUp
        ? "healthy"
        : allDown
        ? "unhealthy"
        : "degraded";

      return {
        status,
        timestamp: new Date().toISOString(),
        version: "0.1.0",
        environment: config.nodeEnv,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks: {
          database: { status: dbHealth.status, latency: dbHealth.latency },
          redis: { status: redisHealth.status, latency: redisHealth.latency },
        },
      };
    },
    {
      detail: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns the health status of the API and its dependencies",
      },
    }
  )

  // Readiness check
  .get(
    "/ready",
    async ({ db, cache }) => {
      const dbHealth = await db.healthCheck();
      const redisHealth = await cache.healthCheck();

      if (dbHealth.status === "up" && redisHealth.status === "up") {
        return { status: "ready" };
      }

      return {
        status: "not_ready",
        checks: { database: dbHealth.status, redis: redisHealth.status },
      };
    },
    {
      detail: {
        tags: ["Health"],
        summary: "Readiness check",
        description: "Returns whether the API is ready to accept traffic",
      },
    }
  )

  // Liveness check
  .get(
    "/live",
    () => ({ status: "alive" }),
    {
      detail: {
        tags: ["Health"],
        summary: "Liveness check",
        description: "Returns whether the API process is running",
      },
    }
  )

  // Root endpoint
  .get("/", () => ({
    name: "Staffora Platform API",
    version: "0.1.0",
    documentation: "/docs",
    login: "/login",
    health: "/health",
  }))

  .get("/login", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Staffora Login</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 32px; background: #0b1220; color: #e6edf3; }
      .container { max-width: 520px; margin: 0 auto; }
      .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 20px; }
      h1 { font-size: 20px; margin: 0 0 16px; }
      label { display: block; font-size: 12px; opacity: 0.9; margin: 14px 0 6px; }
      input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.25); color: #e6edf3; }
      input::placeholder { color: rgba(230,237,243,0.55); }
      .row { display: flex; gap: 10px; margin-top: 16px; }
      button { flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: #2f81f7; color: #fff; cursor: pointer; font-weight: 600; }
      button.secondary { background: rgba(255,255,255,0.08); }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .small { font-size: 12px; opacity: 0.85; margin-top: 10px; }
      pre { margin-top: 14px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px; overflow: auto; max-height: 340px; }
      a { color: #9ecbff; }
      .muted { opacity: 0.75; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>Staffora API Login</h1>
        <div class="muted small">This page calls <code>POST /api/v1/auth/login</code> and stores the session cookie automatically.</div>

        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" placeholder="you@company.com" />

        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />

        <details class="small" style="margin-top:12px;">
          <summary>Advanced</summary>
          <label for="tenantId">Tenant ID (optional)</label>
          <input id="tenantId" type="text" placeholder="UUID (optional)" />
        </details>

        <div class="row">
          <button id="loginBtn">Login</button>
          <button id="meBtn" class="secondary" type="button">Who am I?</button>
          <button id="logoutBtn" class="secondary" type="button">Logout</button>
        </div>

        <div class="small">Docs: <a href="/docs" target="_blank" rel="noreferrer">/docs</a></div>
        <pre id="out" aria-live="polite"></pre>
      </div>
    </div>

    <script>
      const out = document.getElementById('out');
      const emailEl = document.getElementById('email');
      const passwordEl = document.getElementById('password');
      const tenantIdEl = document.getElementById('tenantId');
      const loginBtn = document.getElementById('loginBtn');
      const meBtn = document.getElementById('meBtn');
      const logoutBtn = document.getElementById('logoutBtn');

      function print(obj) {
        out.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
      }

      async function postJson(path, body) {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        return { status: res.status, ok: res.ok, body: parsed };
      }

      async function getJson(path) {
        const res = await fetch(path, {
          method: 'GET',
          credentials: 'include',
        });
        const text = await res.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        return { status: res.status, ok: res.ok, body: parsed };
      }

      loginBtn.addEventListener('click', async () => {
        const email = (emailEl.value || '').trim();
        const password = passwordEl.value || '';
        const tenantId = (tenantIdEl && tenantIdEl.value || '').trim();

        if (!email || !password) {
          print('Enter email and password.');
          return;
        }

        loginBtn.disabled = true;
        try {
          const payload = { email, password };
          if (tenantId) payload.tenantId = tenantId;
          const result = await postJson('/api/v1/auth/login', payload);
          print(result);
        } finally {
          loginBtn.disabled = false;
        }
      });

      meBtn.addEventListener('click', async () => {
        const result = await getJson('/api/v1/auth/me');
        print(result);
      });

      logoutBtn.addEventListener('click', async () => {
        const result = await postJson('/api/v1/auth/logout', {});
        print(result);
      });

      print('Enter email + password, then click Login.');
    </script>
  </body>
</html>`;
  })

  // Auth, tenant, and security plugins
  .use(authPlugin())
  .use(tenantPlugin({ optional: true }))
  .use(rbacPlugin())
  .use(idempotencyPlugin())
  .use(auditPlugin())

  // API v1 routes group
  .group("/api/v1", (api) =>
    api
      // Auth routes (before other modules)
      .use(authRoutes)
      // SSO public routes (no auth required - provider discovery & login initiation)
      .use(ssoPublicRoutes)
      // Tenant + Security (used by frontend hooks)
      .use(tenantRoutes)
      .use(securityRoutes)
      .use(fieldPermissionRoutes)
      .use(securityPortalRoutes)
      .use(managerRoutes)
      // Dashboard + System
      .use(dashboardRoutes)
      .use(systemRoutes)
      .use(usageStatsRoutes)
      // Core modules
      .use(hrRoutes)
      .use(costCentreAssignmentRoutes)
      .use(timeRoutes)
      .use(absenceRoutes)
      // Talent & Learning
      .use(talentRoutes)
      .use(talentPoolRoutes)
      .use(feedback360Routes)
      .use(lmsRoutes)
      // Workflows & Cases
      .use(workflowRoutes)
      .use(casesRoutes)
      // Onboarding
      .use(onboardingRoutes)
      // Benefits Administration
      .use(benefitsRoutes)
      .use(beneficiaryNominationRoutes)
      // Benefits Provider Data Exchange
      .use(benefitsExchangeRoutes)
      // Income Protection Insurance
      .use(incomeProtectionRoutes)
      // Documents
      .use(documentsRoutes)
      // Bulk Document Generation
      .use(bulkDocumentGenerationRoutes)
      // E-Signature Requests
      .use(eSignaturesRoutes)
      // Succession Planning
      .use(successionRoutes)
      // Analytics
      .use(analyticsRoutes)
      // Competencies
      .use(competenciesRoutes)
      // Recruitment
      .use(recruitmentRoutes)
      // Job Board Integration (recruitment)
      .use(jobBoardRoutes)
      // Portal aggregations
      .use(portalRoutes)
      // Client Portal (customer-facing portal on staffora.co.uk)
      .use(clientPortalRoutes)
      // Bulk Operations (cross-module batch endpoints)
      .use(bulkOperationsRoutes)
      // Data Import (CSV bulk data loading)
      .use(dataImportRoutes)
      // Employee Change Requests (self-service + HR review)
      .use(changeRequestPortalRoutes)
      .use(changeRequestAdminRoutes)

      // UK Compliance modules (Employment Rights Act, GDPR, etc.)
      .use(rightToWorkRoutes)
      .use(sspRoutes)
      .use(statutoryLeaveRoutes)
      .use(familyLeaveRoutes)
      .use(parentalLeaveRoutes)
      .use(bereavementRoutes)
      .use(carersLeaveRoutes)
      .use(flexibleWorkingRoutes)
      .use(contractStatementsRoutes)
      .use(contractAmendmentRoutes)
      .use(genderPayGapRoutes)
      .use(nmwRoutes)
      .use(wtrRoutes)
      .use(healthSafetyRoutes)
      .use(warningsRoutes)
      .use(pensionRoutes)
      .use(probationRoutes)
      .use(returnToWorkRoutes)
      .use(bankHolidayRoutes)

      // GDPR & Data Privacy modules
      .use(dsarRoutes)
      .use(dataErasureRoutes)
      .use(dataBreachRoutes)
      .use(dataRetentionRoutes)
      .use(consentRoutes)
      .use(privacyNoticeRoutes)
      .use(dataArchivalRoutes)

      // Employee data modules
      .use(bankDetailRoutes)
      .use(emergencyContactRoutes)
      .use(employeePhotoRoutes)
      .use(diversityRoutes)
      // Global Mobility (international assignments)
      .use(globalMobilityRoutes)
      .use(reasonableAdjustmentsRoutes)
      .use(secondmentRoutes)

      // Payroll & Compensation modules
      .use(payrollRoutes)
      .use(payrollConfigRoutes)
      .use(payslipRoutes)
      .use(taxCodeRoutes)
      .use(salarySacrificeRoutes)
      .use(deductionRoutes)

      // Talent & Learning additional modules
      .use(trainingBudgetRoutes)
      .use(cpdRoutes)
      .use(courseRatingRoutes)
      .use(assessmentRoutes)
      .use(dbsCheckRoutes)
      .use(backgroundCheckRoutes)
      .use(referenceCheckRoutes)
      .use(agencyRoutes)

      // Operations modules
      .use(equipmentRoutes)
      .use(geofenceRoutes)
      .use(headcountPlanningRoutes)
      .use(jobsRoutes)
      .use(letterTemplateRoutes)
      .use(notificationsRoutes)
      .use(delegationRoutes)
      .use(reportsRoutes)
      // Integrations
      .use(integrationsRoutes)
      // SSO Admin (SAML/OIDC configuration management)
      .use(ssoAdminRoutes)
      // Policy Distribution (read receipts)
      // Lookup Values (tenant-configurable dropdowns)
      .use(lookupValuesRoutes)
      .use(policyDistributionRoutes)
      // Email Delivery Monitoring
      .use(emailTrackingRoutes)
      // Overtime Requests (authorisation workflow)
      .use(overtimeRequestRoutes)
      // Employment Tribunal Preparation
      .use(tribunalRoutes)
      // Calendar Sync (iCal feed generation)
      .use(calendarSyncRoutes)
  )

  // 404 handler (must be last)
  .all("/*", ({ set }) => {
    set.status = 404;
    return {
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: "The requested resource was not found",
        requestId: `req_${Date.now().toString(36)}`,
      },
    };
  });

if (import.meta.main) {
  app.listen({
    port: config.port,
    hostname: "0.0.0.0",
  });

  console.log(
    `Staffora API is running at http://${app.server?.hostname}:${app.server?.port}`
  );
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(
    `Documentation: http://${app.server?.hostname}:${app.server?.port}/docs`
  );
}

export type App = typeof app;
