/**
 * Scheduled Jobs Worker
 *
 * Runs periodic tasks like leave balance accruals, timesheet reminders,
 * report generation, and data cleanup.
 *
 * Connection pool strategy:
 * - When launched via worker/index.ts, receives the shared postgres.js
 *   singleton pool and Redis instance (no extra connections created).
 * - When run as a standalone script (bottom of this file), creates its
 *   own postgres.js pool with max=5 connections.
 * See packages/api/src/plugins/db.ts for the full connection budget.
 */

import postgres from "postgres";
import Redis from "ioredis";
import { getDatabaseUrl, getRedisUrl } from "../config/database";
import { StreamKeys } from "../jobs/base";

// Stream keys for notifications
const NOTIFICATIONS_STREAM = "staffora:notifications";

interface ScheduledJob {
  name: string;
  cronExpression: string;
  lastRun: Date | null;
  nextRun: Date;
  handler: () => Promise<void>;
}

class Scheduler {
  private sql: postgres.Sql;
  private redis: Redis;
  private ownsConnections: boolean;
  private running = false;
  private jobs: ScheduledJob[] = [];
  private checkInterval = 60000; // Check every minute

  /**
   * @param injectedSql  Reuse an existing postgres.js pool (e.g. the shared singleton from getDbClient())
   * @param injectedRedis Reuse an existing Redis instance
   */
  constructor(injectedSql?: postgres.Sql, injectedRedis?: Redis) {
    // Reuse injected connections if provided; otherwise create our own
    this.ownsConnections = !injectedSql || !injectedRedis;
    this.sql = injectedSql ?? postgres(getDatabaseUrl(), {
      max: 5,
      transform: postgres.toCamel,
      connection: { search_path: "app,public" },
    });
    this.redis = injectedRedis ?? new Redis(getRedisUrl());
    this.registerJobs();
  }

  private registerJobs() {
    // Daily jobs
    this.jobs.push({
      name: "leave-balance-accrual",
      cronExpression: "0 1 * * *", // 1 AM daily
      lastRun: null,
      nextRun: this.getNextRunTime("0 1 * * *"),
      handler: this.accrueLeaveBalances.bind(this),
    });

    this.jobs.push({
      name: "timesheet-reminder",
      cronExpression: "0 9 * * 5", // 9 AM every Friday
      lastRun: null,
      nextRun: this.getNextRunTime("0 9 * * 5"),
      handler: this.sendTimesheetReminders.bind(this),
    });

    this.jobs.push({
      name: "session-cleanup",
      cronExpression: "0 2 * * *", // 2 AM daily
      lastRun: null,
      nextRun: this.getNextRunTime("0 2 * * *"),
      handler: this.cleanupExpiredSessions.bind(this),
    });

    this.jobs.push({
      name: "outbox-cleanup",
      cronExpression: "0 3 * * *", // 3 AM daily
      lastRun: null,
      nextRun: this.getNextRunTime("0 3 * * *"),
      handler: this.cleanupProcessedOutbox.bind(this),
    });

    // Weekly jobs
    this.jobs.push({
      name: "review-cycle-check",
      cronExpression: "0 8 * * 1", // 8 AM every Monday
      lastRun: null,
      nextRun: this.getNextRunTime("0 8 * * 1"),
      handler: this.checkReviewDeadlines.bind(this),
    });

    this.jobs.push({
      name: "wtr-compliance-check",
      cronExpression: "0 6 * * 1", // 6 AM every Monday
      lastRun: null,
      nextRun: this.getNextRunTime("0 6 * * 1"),
      handler: this.checkWtrCompliance.bind(this),
    });

    this.jobs.push({
      name: "mandatory-training-reminders",
      cronExpression: "0 9 * * 1", // 9 AM every Monday
      lastRun: null,
      nextRun: this.getNextRunTime("0 9 * * 1"),
      handler: this.sendMandatoryTrainingReminders.bind(this),
    });

    // Monthly jobs
    this.jobs.push({
      name: "birthday-notifications",
      cronExpression: "0 8 1 * *", // 8 AM on 1st of month
      lastRun: null,
      nextRun: this.getNextRunTime("0 8 1 * *"),
      handler: this.generateBirthdayNotifications.bind(this),
    });

    // Hourly jobs
    this.jobs.push({
      name: "dlq-monitoring",
      cronExpression: "0 * * * *", // Top of every hour
      lastRun: null,
      nextRun: this.getNextRunTime("0 * * * *"),
      handler: this.monitorDeadLetterQueues.bind(this),
    });

    this.jobs.push({
      name: "user-table-drift-detection",
      cronExpression: "30 * * * *", // 30 minutes past every hour
      lastRun: null,
      nextRun: this.getNextRunTime("30 * * * *"),
      handler: this.detectUserTableDrift.bind(this),
    });

    this.jobs.push({
      name: "workflow-auto-escalation",
      cronExpression: "*/10 * * * *", // Every 10 minutes
      lastRun: null,
      nextRun: this.getNextRunTime("*/10 * * * *"),
      handler: this.escalateOverdueWorkflowSteps.bind(this),
    });

    this.jobs.push({
      name: "case-sla-breach-check",
      cronExpression: "*/10 * * * *", // Every 10 minutes
      lastRun: null,
      nextRun: this.getNextRunTime("*/10 * * * *"),
      handler: this.checkCaseSlaBreaches.bind(this),
    });

    this.jobs.push({
      name: "scheduled-report-runner",
      cronExpression: "*/15 * * * *", // Every 15 minutes
      lastRun: null,
      nextRun: this.getNextRunTime("*/15 * * * *"),
      handler: this.runScheduledReports.bind(this),
    });

    // Daily usage analytics aggregation
    this.jobs.push({
      name: "tenant-usage-stats",
      cronExpression: "30 2 * * *", // 2:30 AM daily (after session cleanup)
      lastRun: null,
      nextRun: this.getNextRunTime("30 2 * * *"),
      handler: this.calculateTenantUsageStats.bind(this),
    });

    // Weekly data archival — archive old completed records
    this.jobs.push({
      name: "data-archival",
      cronExpression: "0 4 * * 0", // 4 AM every Sunday
      lastRun: null,
      nextRun: this.getNextRunTime("0 4 * * 0"),
      handler: this.runDataArchival.bind(this),
    });

    // Dashboard materialized view refresh — every 5 minutes
    // Refreshes pre-aggregated counters for employee, leave, case, and
    // onboarding stats using REFRESH CONCURRENTLY (non-blocking reads).
    this.jobs.push({
      name: "dashboard-stats-refresh",
      cronExpression: "*/5 * * * *", // Every 5 minutes
      lastRun: null,
      nextRun: this.getNextRunTime("*/5 * * * *"),
      handler: this.refreshDashboardStats.bind(this),
    });
  }

  async start() {
    console.log("[Scheduler] Starting...");
    this.running = true;

    while (this.running) {
      const now = new Date();

      // FIX 2: Collect all due jobs and run them concurrently
      const dueJobs = this.jobs.filter((job) => job.nextRun <= now);

      if (dueJobs.length > 0) {
        console.log(
          `[Scheduler] Running ${dueJobs.length} due job(s): ${dueJobs.map((j) => j.name).join(", ")}`
        );

        const results = await Promise.allSettled(
          dueJobs.map(async (job) => {
            console.log(`[Scheduler] Running job: ${job.name}`);
            await job.handler();
            return job.name;
          })
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i]!;
          const job = dueJobs[i]!;

          if (result.status === "fulfilled") {
            job.lastRun = now;
            console.log(`[Scheduler] Completed job: ${job.name}`);
          } else {
            console.error(
              `[Scheduler] Error in job ${job.name}:`,
              result.reason
            );
          }

          // Calculate next run time regardless of success/failure
          job.nextRun = this.getNextRunTime(job.cronExpression);
          console.log(
            `[Scheduler] Next run for ${job.name}: ${job.nextRun.toISOString()}`
          );
        }
      }

      await this.sleep(this.checkInterval);
    }
  }

  async stop() {
    console.log("[Scheduler] Stopping...");
    this.running = false;
    // Only close connections we created ourselves; injected pools are
    // owned by the caller (e.g. worker/index.ts manages their lifecycle).
    if (this.ownsConnections) {
      await this.redis.quit();
      await this.sql.end();
    }
  }

  // Simple cron parser — supports fixed values, wildcards (*), and step
  // notation (*/N). Only handles minute, hour, day-of-month, and day-of-week
  // fields (month field is ignored / always treated as *).
  private getNextRunTime(cron: string): Date {
    const [minute, hour, dayOfMonth, _month, dayOfWeek] = cron.split(" ");
    const now = new Date();
    const next = new Date(now);

    next.setSeconds(0);
    next.setMilliseconds(0);

    // Parse a cron field value, handling */N step notation
    const parseCronField = (
      field: string | undefined,
      currentValue: number,
      defaultValue: number
    ): { value: number; isStep: boolean; stepInterval: number } => {
      if (!field || field === "*") {
        return { value: currentValue, isStep: false, stepInterval: 0 };
      }
      if (field.startsWith("*/")) {
        const interval = parseInt(field.slice(2));
        if (!isNaN(interval) && interval > 0) {
          // Find the next value >= current that is divisible by interval
          const nextValue =
            Math.ceil((currentValue + 1) / interval) * interval;
          return { value: nextValue, isStep: true, stepInterval: interval };
        }
      }
      const parsed = parseInt(field);
      return {
        value: isNaN(parsed) ? defaultValue : parsed,
        isStep: false,
        stepInterval: 0,
      };
    };

    const minuteField = parseCronField(minute, now.getMinutes(), 0);
    const hourField = parseCronField(hour, now.getHours(), 0);

    // Handle step-based intervals (e.g. */15 * * * *)
    if (minuteField.isStep && (hour === "*" || hour === undefined)) {
      const interval = minuteField.stepInterval;
      // Calculate next aligned minute from now
      const totalMinutes =
        now.getHours() * 60 + now.getMinutes();
      const nextAligned =
        (Math.floor(totalMinutes / interval) + 1) * interval;
      next.setHours(Math.floor(nextAligned / 60) % 24);
      next.setMinutes(nextAligned % 60);

      // If we wrapped past midnight, move to next day
      if (nextAligned >= 24 * 60) {
        next.setDate(next.getDate() + 1);
        next.setHours(0);
        next.setMinutes(0);
      }

      return next;
    }

    // Set to the next occurrence (fixed time)
    next.setMinutes(minuteField.value);
    next.setHours(hourField.value);

    // If the time has passed today, move to next day
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Handle day of week
    if (dayOfWeek !== "*" && dayOfWeek !== undefined) {
      const targetDay = parseInt(dayOfWeek ?? "0");
      if (!isNaN(targetDay)) {
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1);
        }
      }
    }

    // Handle day of month
    if (dayOfMonth !== "*" && dayOfMonth !== undefined) {
      const targetDate = parseInt(dayOfMonth ?? "1");
      if (!isNaN(targetDate)) {
        next.setDate(targetDate);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
      }
    }

    return next;
  }

  // ---------------------------------------------------------------------------
  // Batch Redis XADD helper
  // ---------------------------------------------------------------------------
  // Collects payloads and writes to Redis via pipeline in batches of 200
  // to avoid hammering Redis with individual XADD calls.
  private async batchXAdd(
    stream: string,
    payloads: Array<Record<string, unknown>>
  ): Promise<void> {
    const BATCH_SIZE = 200;

    for (let offset = 0; offset < payloads.length; offset += BATCH_SIZE) {
      const batch = payloads.slice(offset, offset + BATCH_SIZE);
      const pipeline = this.redis.pipeline();

      for (const payload of batch) {
        pipeline.xadd(
          stream,
          "*",
          "payload",
          JSON.stringify(payload),
          "attempt",
          "1"
        );
      }

      await pipeline.exec();
    }
  }

  // Job Handlers

  private async accrueLeaveBalances() {
    console.log("[Job] Accruing leave balances...");

    const currentYear = new Date().getFullYear();

    // FIX 1: Wrap system context in try-finally
    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Batch-update all qualifying leave balances in a single statement.
      // Joins policies -> balances -> employees so we avoid the previous
      // N+1 pattern (one query per policy x one query per employee).
      const result = await this.sql`
        UPDATE app.leave_balances lb
        SET accrued    = lb.accrued + COALESCE(lp.accrual_rate, 0),
            balance    = lb.balance + COALESCE(lp.accrual_rate, 0),
            updated_at = now()
        FROM app.leave_policies lp
        JOIN app.tenants t ON t.id = lp.tenant_id
        JOIN app.employees e ON e.id = lb.employee_id
        WHERE lb.leave_type_id = lp.leave_type_id
          AND lb.tenant_id     = lp.tenant_id
          AND lb.year           = ${currentYear}
          AND lp.accrual_frequency IS NOT NULL
          AND t.status  = 'active'
          AND e.status  = 'active'
      `;

      console.log(
        `[Job] Accrued leave balances for ${result.count} employee-policy rows`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private async sendTimesheetReminders() {
    console.log("[Job] Sending timesheet reminders...");

    // FIX 1: Wrap system context in try-finally
    // FIX 6: Add LIMIT 1000 to prevent unbounded result sets
    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Find employees with pending timesheets
      const pending = await this.sql`
        SELECT DISTINCT
          e.id as employee_id,
          ep.first_name,
          ep.last_name,
          u.email,
          u.id as user_id,
          t.id as tenant_id,
          t.name as tenant_name
        FROM app.employees e
        JOIN app.tenants t ON t.id = e.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.users u ON u.id = e.user_id
        WHERE e.status = 'active'
          AND u.email IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM app.timesheets ts
            WHERE ts.employee_id = e.id
              AND ts.period_start <= CURRENT_DATE
              AND ts.period_end >= CURRENT_DATE - interval '7 days'
              AND ts.status IN ('submitted', 'approved')
          )
        LIMIT 1000
      `;

      console.log(
        `[Job] Found ${pending.length} employees needing timesheet reminders`
      );

      // FIX 6: Collect payloads and batch xadd
      const payloads: Array<Record<string, unknown>> = [];

      for (const emp of pending) {
        const firstName = emp["firstName"] || "Team Member";
        const email = emp["email"];
        const userId = emp["userId"];
        const tenantId = emp["tenantId"];

        // In-app notification
        if (userId) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.in_app",
            tenantId,
            data: {
              userId,
              title: "Timesheet Reminder",
              message: "Please submit your timesheet for this week.",
              type: "timesheet_reminder",
              actionUrl: "/employee/time",
              actionText: "Submit Timesheet",
            },
          });
        }

        // Email notification
        if (email) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.email",
            tenantId,
            data: {
              to: email,
              subject: "Timesheet Reminder - Please Submit Your Hours",
              template: "notification",
              templateData: {
                title: "Timesheet Reminder",
                message: `Hi ${firstName}, this is a reminder to submit your timesheet for this week before the deadline.`,
                actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/time`,
                actionText: "Submit Timesheet",
              },
            },
          });
        }
      }

      await this.batchXAdd(NOTIFICATIONS_STREAM, payloads);

      console.log(
        `[Job] Sent timesheet reminders to ${pending.length} employees`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private async cleanupExpiredSessions() {
    console.log("[Job] Cleaning up expired sessions...");

    // FIX 1: Wrap system context in try-finally
    await this.sql`SELECT app.enable_system_context()`;
    try {
      const result = await this.sql`
        DELETE FROM app.sessions
        WHERE expires_at < now() - interval '7 days'
      `;

      console.log(`[Job] Deleted ${result.count} expired sessions`);
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private async cleanupProcessedOutbox() {
    console.log("[Job] Cleaning up processed outbox events...");

    // FIX 1: Wrap system context in try-finally
    await this.sql`SELECT app.enable_system_context()`;
    try {
      const result = await this.sql`
        DELETE FROM app.domain_outbox
        WHERE processed_at < now() - interval '30 days'
      `;

      console.log(`[Job] Deleted ${result.count} old outbox events`);
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private async checkReviewDeadlines() {
    console.log("[Job] Checking review deadlines...");

    // FIX 1: Wrap system context in try-finally
    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Find upcoming review deadlines and affected employees
      const upcoming = await this.sql`
        SELECT
          rc.id as cycle_id,
          rc.name as cycle_name,
          rc.review_start,
          rc.review_end,
          rc.tenant_id,
          r.id as review_id,
          r.employee_id,
          r.reviewer_id,
          r.status as review_status,
          u.id as user_id,
          u.email,
          ep.first_name
        FROM app.reviews r
        JOIN app.performance_cycles rc ON rc.id = r.cycle_id
        JOIN app.employees e ON e.id = r.employee_id
        LEFT JOIN app.users u ON u.id = e.user_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        WHERE rc.status IN ('active', 'review')
          AND r.status IN ('pending', 'in_progress')
          AND rc.review_end BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '3 days'
      `;

      console.log(
        `[Job] Found ${upcoming.length} pending reviews with upcoming deadlines`
      );

      // FIX 6: Collect payloads and batch xadd
      const payloads: Array<Record<string, unknown>> = [];

      for (const review of upcoming) {
        const userId = review["userId"];
        const email = review["email"];
        const firstName = review["firstName"] || "Team Member";
        const tenantId = review["tenantId"];
        const cycleName = review["cycleName"];
        const selfDeadline = review["selfReviewDeadline"];
        const managerDeadline = review["managerReviewDeadline"];

        const deadline = selfDeadline
          ? new Date(selfDeadline).toLocaleDateString()
          : new Date(managerDeadline).toLocaleDateString();

        // In-app notification
        if (userId) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.in_app",
            tenantId,
            data: {
              userId,
              title: "Performance Review Deadline Approaching",
              message: `Your review for "${cycleName}" is due by ${deadline}. Please complete it soon.`,
              type: "review_deadline",
              actionUrl: `/employee/performance/reviews/${review["reviewId"]}`,
              actionText: "Complete Review",
            },
          });
        }

        // Email notification
        if (email) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.email",
            tenantId,
            data: {
              to: email,
              subject: `Performance Review Deadline - ${cycleName}`,
              template: "notification",
              templateData: {
                title: "Performance Review Deadline Approaching",
                message: `Hi ${firstName}, your performance review for "${cycleName}" is due by ${deadline}. Please complete it before the deadline.`,
                actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/performance/reviews/${review["reviewId"]}`,
                actionText: "Complete Review",
              },
            },
          });
        }
      }

      await this.batchXAdd(NOTIFICATIONS_STREAM, payloads);

      console.log(`[Job] Sent ${upcoming.length} review deadline reminders`);
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  // FIX 3: WTR compliance check using single INSERT...SELECT ON CONFLICT
  // Replaces the previous 1+2N query pattern (1 query for employees, then
  // per-employee: 1 to calculate hours + 1 to insert alert) with a single
  // SQL statement that calculates average weekly hours and creates alerts
  // for employees exceeding the 48-hour threshold in one shot.
  private async checkWtrCompliance() {
    console.log("[Job] Checking WTR compliance...");

    const WTR_WEEKLY_LIMIT = 48;
    const REFERENCE_WEEKS = 17; // UK standard 17-week reference period

    await this.sql`SELECT app.enable_system_context()`;
    try {
      const result = await this.sql`
        WITH employee_weekly_hours AS (
          -- Calculate average weekly hours over the reference period
          -- for all active employees across all active tenants
          SELECT
            e.tenant_id,
            e.id AS employee_id,
            COALESCE(
              SUM(
                EXTRACT(EPOCH FROM (
                  CASE
                    WHEN te_out.event_time IS NOT NULL
                    THEN te_out.event_time - te_in.event_time
                    ELSE INTERVAL '0'
                  END
                )) / 3600.0
              ) / ${REFERENCE_WEEKS},
              0
            ) AS avg_weekly_hours
          FROM app.employees e
          JOIN app.tenants t ON t.id = e.tenant_id AND t.status = 'active'
          LEFT JOIN app.time_events te_in
            ON te_in.employee_id = e.id
            AND te_in.tenant_id = e.tenant_id
            AND te_in.event_type = 'clock_in'
            AND te_in.event_time >= CURRENT_DATE - (${REFERENCE_WEEKS} * 7 || ' days')::interval
          LEFT JOIN LATERAL (
            SELECT te2.event_time
            FROM app.time_events te2
            WHERE te2.employee_id = te_in.employee_id
              AND te2.tenant_id = te_in.tenant_id
              AND te2.event_type = 'clock_out'
              AND te2.event_time > te_in.event_time
            ORDER BY te2.event_time ASC
            LIMIT 1
          ) te_out ON true
          WHERE e.status = 'active'
            -- Exclude employees who have opted out of the 48-hour limit
            AND NOT EXISTS (
              SELECT 1 FROM app.wtr_opt_outs wo
              WHERE wo.employee_id = e.id
                AND wo.tenant_id = e.tenant_id
                AND wo.status = 'active'
                AND wo.opted_out = true
            )
          GROUP BY e.tenant_id, e.id
          HAVING COALESCE(
            SUM(
              EXTRACT(EPOCH FROM (
                CASE
                  WHEN te_out.event_time IS NOT NULL
                  THEN te_out.event_time - te_in.event_time
                  ELSE INTERVAL '0'
                END
              )) / 3600.0
            ) / ${REFERENCE_WEEKS},
            0
          ) > ${WTR_WEEKLY_LIMIT}
        )
        INSERT INTO app.wtr_alerts (
          id, tenant_id, employee_id, alert_type,
          reference_period_start, reference_period_end,
          actual_value, threshold_value, details, created_at
        )
        SELECT
          gen_random_uuid(),
          ewh.tenant_id,
          ewh.employee_id,
          'weekly_hours_exceeded'::app.wtr_alert_type,
          (CURRENT_DATE - (${REFERENCE_WEEKS} * 7 || ' days')::interval)::date,
          CURRENT_DATE,
          ROUND(ewh.avg_weekly_hours::numeric, 2),
          ${WTR_WEEKLY_LIMIT},
          jsonb_build_object(
            'referenceWeeks', ${REFERENCE_WEEKS},
            'avgWeeklyHours', ROUND(ewh.avg_weekly_hours::numeric, 2),
            'threshold', ${WTR_WEEKLY_LIMIT},
            'generatedBy', 'scheduler:wtr-compliance-check'
          ),
          now()
        FROM employee_weekly_hours ewh
        -- Avoid duplicate alerts for the same employee and period
        WHERE NOT EXISTS (
          SELECT 1 FROM app.wtr_alerts wa
          WHERE wa.employee_id = ewh.employee_id
            AND wa.tenant_id = ewh.tenant_id
            AND wa.alert_type = 'weekly_hours_exceeded'
            AND wa.reference_period_end = CURRENT_DATE
        )
      `;

      console.log(
        `[Job] WTR compliance check complete — created ${result.count} new alerts`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  /**
   * Send reminders for overdue mandatory training assignments.
   * Finds employees who have overdue mandatory courses and sends
   * both in-app and email notifications. Also notifies HR admins
   * with a summary of overdue training across the organisation.
   */
  private async sendMandatoryTrainingReminders(): Promise<void> {
    console.log("[Job] Checking for overdue mandatory training...");

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Find all overdue mandatory assignments
      const overdue = await this.sql`
        SELECT
          a.id AS assignment_id,
          a.tenant_id,
          a.employee_id,
          a.course_id,
          a.due_date,
          (CURRENT_DATE - a.due_date)::integer AS days_overdue,
          c.name AS course_name,
          e.user_id,
          ep.first_name,
          ep.last_name,
          u.email
        FROM app.assignments a
        JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
        JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
        LEFT JOIN app.users u ON u.id = e.user_id
        WHERE c.is_mandatory = true
          AND a.assignment_type = 'required'
          AND a.due_date < CURRENT_DATE
          AND a.status NOT IN ('completed', 'expired')
          AND e.status = 'active'
        ORDER BY a.due_date ASC
        LIMIT 1000
      `;

      if (overdue.length === 0) {
        console.log("[Job] Mandatory training reminders complete — no overdue assignments");
        return;
      }

      console.log(`[Job] Found ${overdue.length} overdue mandatory training assignment(s)`);

      const payloads: Array<Record<string, unknown>> = [];

      for (const row of overdue) {
        const userId = row["userId"];
        const email = row["email"];
        const firstName = row["firstName"] || "Team Member";
        const tenantId = row["tenantId"];
        const courseName = row["courseName"] || "Mandatory Course";
        const daysOverdue = row["daysOverdue"];

        // In-app notification to the employee
        if (userId) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.in_app",
            tenantId,
            data: {
              userId,
              title: "Overdue Mandatory Training",
              message: `Your mandatory training "${courseName}" is ${daysOverdue} day(s) overdue. Please complete it as soon as possible.`,
              type: "mandatory_training_overdue",
              actionUrl: "/employee/learning",
              actionText: "Go to Learning",
            },
          });
        }

        // Email notification
        if (email) {
          payloads.push({
            id: crypto.randomUUID(),
            type: "notification.email",
            tenantId,
            data: {
              to: email,
              subject: `Overdue Mandatory Training - ${courseName}`,
              template: "notification",
              templateData: {
                title: "Overdue Mandatory Training",
                message: `Hi ${firstName}, your mandatory training "${courseName}" is ${daysOverdue} day(s) overdue. Please complete it at your earliest opportunity to remain compliant.`,
                actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/learning`,
                actionText: "Complete Training",
              },
            },
          });
        }
      }

      await this.batchXAdd(NOTIFICATIONS_STREAM, payloads);

      // Also build per-tenant summaries for HR admins
      type OverdueRow = (typeof overdue)[number];
      const byTenant = new Map<string, OverdueRow[]>();
      for (const row of overdue) {
        const tid = row["tenantId"] as string;
        if (!byTenant.has(tid)) byTenant.set(tid, []);
        byTenant.get(tid)!.push(row);
      }

      // Load HR admins across all affected tenants in one query
      const tenantIds = [...byTenant.keys()];
      const hrAdmins = await this.sql`
        SELECT DISTINCT u.id AS user_id, u.email, ra.tenant_id
        FROM app.users u
        JOIN app.role_assignments ra ON ra.user_id = u.id
        JOIN app.roles r ON r.id = ra.role_id
        WHERE r.name IN ('HR Admin', 'HR Manager', 'System Admin')
          AND u.status = 'active'
          AND ra.tenant_id = ANY(${tenantIds}::uuid[])
      `;

      type AdminRow = (typeof hrAdmins)[number];
      const adminsByTenant = new Map<string, AdminRow[]>();
      for (const admin of hrAdmins) {
        const tid = admin["tenantId"] as string;
        if (!adminsByTenant.has(tid)) adminsByTenant.set(tid, []);
        adminsByTenant.get(tid)!.push(admin);
      }

      const adminPayloads: Array<Record<string, unknown>> = [];

      for (const [tenantId, tenantOverdue] of byTenant) {
        const admins = adminsByTenant.get(tenantId) || [];
        if (admins.length === 0) continue;

        const summaryMessage = `There are ${tenantOverdue.length} overdue mandatory training assignment(s) across your organisation. Please review the compliance report.`;

        for (const admin of admins) {
          const adminUserId = admin["userId"];
          const adminEmail = admin["email"];

          if (adminUserId) {
            adminPayloads.push({
              id: crypto.randomUUID(),
              type: "notification.in_app",
              tenantId,
              data: {
                userId: adminUserId,
                title: "Mandatory Training Compliance Alert",
                message: summaryMessage,
                type: "mandatory_training_compliance_alert",
                actionUrl: "/admin/lms/compliance-report",
                actionText: "View Report",
                data: { overdueCount: tenantOverdue.length },
              },
            });
          }

          if (adminEmail) {
            adminPayloads.push({
              id: crypto.randomUUID(),
              type: "notification.email",
              tenantId,
              data: {
                to: adminEmail,
                subject: `Mandatory Training Compliance Alert - ${tenantOverdue.length} Overdue`,
                template: "notification",
                templateData: {
                  title: "Mandatory Training Compliance Alert",
                  message: summaryMessage,
                  actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/admin/lms/compliance-report`,
                  actionText: "View Compliance Report",
                },
              },
            });
          }
        }
      }

      await this.batchXAdd(NOTIFICATIONS_STREAM, adminPayloads);

      console.log(
        `[Job] Mandatory training reminders complete — notified ${overdue.length} employee(s) and HR admins across ${byTenant.size} tenant(s)`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private async generateBirthdayNotifications() {
    console.log("[Job] Generating birthday notifications...");

    // FIX 1: Wrap system context in try-finally
    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Find birthdays this month
      const birthdays = await this.sql`
        SELECT
          e.id as employee_id,
          ep.first_name,
          ep.last_name,
          ep.date_of_birth,
          t.id as tenant_id,
          t.name as tenant_name,
          EXTRACT(DAY FROM ep.date_of_birth) as birth_day
        FROM app.employees e
        JOIN app.tenants t ON t.id = e.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        WHERE e.status = 'active'
          AND EXTRACT(MONTH FROM ep.date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
        ORDER BY EXTRACT(DAY FROM ep.date_of_birth)
      `;

      console.log(`[Job] Found ${birthdays.length} birthdays this month`);

      if (birthdays.length === 0) return;

      // FIX 4: Load all HR admins across all tenants in a single query upfront
      // instead of querying per-tenant inside the loop.
      const allAdmins = await this.sql`
        SELECT DISTINCT u.id as user_id, u.email, ra.tenant_id
        FROM app.users u
        JOIN app.role_assignments ra ON ra.user_id = u.id
        JOIN app.roles r ON r.id = ra.role_id
        WHERE r.name IN ('HR Admin', 'HR Manager', 'System Admin')
          AND u.status = 'active'
      `;

      // Build a Map<tenantId, admin[]> from the single query result
      type AdminRow = (typeof allAdmins)[number];
      const adminsByTenant = new Map<string, AdminRow[]>();
      for (const admin of allAdmins) {
        const tenantId = admin["tenantId"] as string;
        if (!adminsByTenant.has(tenantId)) {
          adminsByTenant.set(tenantId, []);
        }
        adminsByTenant.get(tenantId)!.push(admin);
      }

      // Group birthdays by tenant
      type BirthdayRow = (typeof birthdays)[number];
      const byTenant = new Map<string, BirthdayRow[]>();
      for (const bday of birthdays) {
        const tenantId = bday["tenantId"] as string;
        if (!byTenant.has(tenantId)) {
          byTenant.set(tenantId, []);
        }
        byTenant.get(tenantId)!.push(bday);
      }

      // FIX 6: Collect all notification payloads for batched redis write
      const payloads: Array<Record<string, unknown>> = [];

      // For each tenant, look up HR admins from the pre-loaded map and notify them
      for (const [tenantId, tenantBirthdays] of byTenant) {
        const hrAdmins = adminsByTenant.get(tenantId);
        if (!hrAdmins || hrAdmins.length === 0) continue;

        // Build birthday list message
        const birthdayList = tenantBirthdays
          .map((b) => {
            const day = b["birthDay"];
            const name =
              `${b["firstName"] || ""} ${b["lastName"] || ""}`.trim() ||
              "Employee";
            const monthDay = new Date(
              2000,
              new Date().getMonth(),
              Number(day)
            ).toLocaleDateString("en-GB", {
              month: "short",
              day: "numeric",
            });
            return `- ${name} (${monthDay})`;
          })
          .join("\n");

        const monthName = new Date().toLocaleDateString("en-GB", {
          month: "long",
        });

        // Notify each HR admin
        for (const admin of hrAdmins) {
          const userId = admin["userId"];
          const email = admin["email"];

          // In-app notification
          if (userId) {
            payloads.push({
              id: crypto.randomUUID(),
              type: "notification.in_app",
              tenantId,
              data: {
                userId,
                title: `${monthName} Birthdays`,
                message: `There are ${tenantBirthdays.length} employee birthdays this month.`,
                type: "birthday_report",
                actionUrl: "/admin/reports/birthdays",
                actionText: "View Report",
                data: { count: tenantBirthdays.length, month: monthName },
              },
            });
          }

          // Email with birthday list
          if (email) {
            payloads.push({
              id: crypto.randomUUID(),
              type: "notification.email",
              tenantId,
              data: {
                to: email,
                subject: `Employee Birthdays - ${monthName}`,
                template: "notification",
                templateData: {
                  title: `${monthName} Employee Birthdays`,
                  message: `Here are the employee birthdays this month:\n\n${birthdayList}\n\nTotal: ${tenantBirthdays.length} birthdays`,
                  actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/admin/reports/birthdays`,
                  actionText: "View Full Report",
                },
              },
            });
          }
        }
      }

      await this.batchXAdd(NOTIFICATIONS_STREAM, payloads);

      console.log(
        `[Job] Sent birthday notifications to ${byTenant.size} tenants`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  // FIX 5: DLQ monitoring job — runs hourly, checks XLEN on each stream's
  // dead letter queue key, logs warnings if any exceeds 1000 messages.
  private async monitorDeadLetterQueues() {
    console.log("[Job] Monitoring dead letter queues...");

    const DLQ_WARNING_THRESHOLD = 1000;

    const streamKeys = Object.values(StreamKeys);
    const dlqKeys = streamKeys.map((key) => `${key}:dlq`);

    // Use a pipeline to check all DLQ lengths in a single round trip
    const pipeline = this.redis.pipeline();
    for (const dlqKey of dlqKeys) {
      pipeline.xlen(dlqKey);
    }
    const results = await pipeline.exec();

    let totalDlqMessages = 0;
    let warningCount = 0;

    if (results) {
      for (let i = 0; i < dlqKeys.length; i++) {
        const result = results[i];
        if (!result) continue;

        const [err, length] = result;
        if (err) {
          console.error(
            `[Job] Error checking DLQ ${dlqKeys[i]}:`,
            err.message
          );
          continue;
        }

        const queueLength = (length as number) || 0;
        totalDlqMessages += queueLength;

        if (queueLength > DLQ_WARNING_THRESHOLD) {
          warningCount++;
          console.warn(
            `[Job] DLQ WARNING: ${dlqKeys[i]} has ${queueLength} messages (threshold: ${DLQ_WARNING_THRESHOLD})`
          );
        }
      }
    }

    if (warningCount > 0) {
      console.warn(
        `[Job] DLQ monitoring complete — ${warningCount} queue(s) exceeded threshold, total DLQ messages: ${totalDlqMessages}`
      );
    } else {
      console.log(
        `[Job] DLQ monitoring complete — all queues healthy, total DLQ messages: ${totalDlqMessages}`
      );
    }
  }

  /**
   * Auto-escalate overdue workflow tasks based on the workflow_slas table.
   *
   * Phase 1 — Detection:
   *   Calls the DB function `app.check_workflow_task_slas()` which scans all
   *   active tasks with SLA deadlines, creating 'warning' or 'breached'
   *   rows in `workflow_sla_events` (deduplicated by task+sla+type).
   *
   * Phase 2 — Processing:
   *   Picks up unprocessed SLA events and executes the configured
   *   escalation action: notify, reassign, auto_approve, or auto_reject.
   *   Each processed event is logged to `sla_escalation_log` and an outbox
   *   event is written atomically.
   */
  private async escalateOverdueWorkflowSteps(): Promise<void> {
    console.log("[Job] Starting workflow SLA escalation check...");

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Phase 1 — detect breaches and create SLA events
      const [checkResult] = await this.sql`SELECT * FROM app.check_workflow_task_slas()`;
      const eventsCreated = checkResult?.eventsCreated ?? 0;
      const warningsCreated = checkResult?.warningsCreated ?? 0;
      const breachesCreated = checkResult?.breachesCreated ?? 0;

      if (eventsCreated > 0) {
        console.log(
          `[Job] SLA check created ${eventsCreated} event(s): ${warningsCreated} warning(s), ${breachesCreated} breach(es)`
        );
      }

      // Phase 2 — process unprocessed SLA events
      const unprocessed = await this.sql`SELECT * FROM app.get_unprocessed_sla_events(50)`;

      if (unprocessed.length === 0) {
        console.log("[Job] Workflow SLA escalation complete — no unprocessed events");
        return;
      }

      console.log(`[Job] Processing ${unprocessed.length} unprocessed SLA event(s)`);

      const notificationPayloads: Array<Record<string, unknown>> = [];
      let processedCount = 0;

      for (const evt of unprocessed) {
        try {
          const action = evt.escalationAction as string;
          const taskId = evt.taskId as string;
          const tenantId = evt.tenantId as string;
          const eventType = evt.eventType as string;
          const slaId = evt.slaId as string;
          const eventId = evt.id as string;
          const escalationTargetUserId = evt.escalationTargetUserId as string | null;
          const escalationTargetRoleId = evt.escalationTargetRoleId as string | null;

          // Get current task details for context
          const [task] = await this.sql`
            SELECT wt.id, wt.assigned_to, wt.step_name, wt.instance_id,
                   wt.sla_deadline, wt.tenant_id,
                   wi.definition_id
            FROM app.workflow_tasks wt
            JOIN app.workflow_instances wi ON wi.id = wt.instance_id
            WHERE wt.id = ${taskId}::uuid
          `;

          if (!task) {
            // Task no longer exists — mark event as processed
            await this.sql`SELECT app.mark_sla_event_processed(${eventId}::uuid, '{"success": false, "reason": "task_not_found"}'::jsonb)`;
            continue;
          }

          // Skip tasks that have already been completed/cancelled since the event was created
          const taskStatus = task.status as string;
          if (["completed", "cancelled", "skipped"].includes(taskStatus)) {
            await this.sql`SELECT app.mark_sla_event_processed(${eventId}::uuid, '{"success": true, "reason": "task_already_resolved"}'::jsonb)`;
            continue;
          }

          const previousAssignee = task.assignedTo as string | null;
          let newAssignee: string | null = null;
          let actionDescription: string;

          // Resolve the escalation target — prefer explicit user, then resolve
          // from role members, then fall back to manager chain
          const resolvedTarget = await this.resolveEscalationTarget(
            escalationTargetUserId,
            escalationTargetRoleId,
            previousAssignee,
            tenantId
          );

          if (eventType === "warning") {
            // Warnings always just send a notification — no reassignment
            actionDescription = "SLA warning notification sent";

            const targetUserId = resolvedTarget || previousAssignee;
            if (targetUserId) {
              notificationPayloads.push({
                id: crypto.randomUUID(),
                type: "notification.in_app",
                tenantId,
                data: {
                  userId: targetUserId,
                  title: "SLA Warning: Task Approaching Deadline",
                  message: `Task "${task.stepName || "Workflow task"}" is approaching its SLA deadline. Please take action soon.`,
                  type: "sla_warning",
                  data: { taskId, instanceId: task.instanceId },
                },
              });
            }
          } else if (eventType === "breached") {
            // Breach — execute the configured escalation action
            switch (action) {
              case "notify": {
                actionDescription = "SLA breach notification sent";
                const targetUserId = resolvedTarget || previousAssignee;
                if (targetUserId) {
                  notificationPayloads.push({
                    id: crypto.randomUUID(),
                    type: "notification.in_app",
                    tenantId,
                    data: {
                      userId: targetUserId,
                      title: "SLA Breached: Immediate Action Required",
                      message: `Task "${task.stepName || "Workflow task"}" has breached its SLA deadline.`,
                      type: "sla_breach",
                      data: { taskId, instanceId: task.instanceId },
                    },
                  });
                }
                break;
              }

              case "reassign": {
                newAssignee = resolvedTarget;
                if (newAssignee && newAssignee !== previousAssignee) {
                  await this.sql`
                    UPDATE app.workflow_tasks
                    SET assigned_to = ${newAssignee}::uuid,
                        status = 'escalated'
                    WHERE id = ${taskId}::uuid
                      AND status IN ('pending', 'assigned', 'in_progress')
                  `;
                  actionDescription = `Reassigned from ${previousAssignee || "unassigned"} to ${newAssignee}`;

                  // Notify the new assignee
                  notificationPayloads.push({
                    id: crypto.randomUUID(),
                    type: "notification.in_app",
                    tenantId,
                    data: {
                      userId: newAssignee,
                      title: "Workflow Task Escalated to You",
                      message: `Task "${task.stepName || "Workflow task"}" has been escalated to you after SLA breach.`,
                      type: "task_assigned",
                      data: { taskId, instanceId: task.instanceId },
                    },
                  });

                  // Also notify the previous assignee
                  if (previousAssignee) {
                    notificationPayloads.push({
                      id: crypto.randomUUID(),
                      type: "notification.in_app",
                      tenantId,
                      data: {
                        userId: previousAssignee,
                        title: "Task Escalated Due to SLA Breach",
                        message: `Task "${task.stepName || "Workflow task"}" was reassigned due to SLA breach.`,
                        type: "sla_breach",
                        data: { taskId, instanceId: task.instanceId },
                      },
                    });
                  }
                } else {
                  actionDescription = "Reassign requested but no valid target found — notification sent instead";
                  if (previousAssignee) {
                    notificationPayloads.push({
                      id: crypto.randomUUID(),
                      type: "notification.in_app",
                      tenantId,
                      data: {
                        userId: previousAssignee,
                        title: "SLA Breached: Immediate Action Required",
                        message: `Task "${task.stepName || "Workflow task"}" has breached its SLA deadline.`,
                        type: "sla_breach",
                        data: { taskId, instanceId: task.instanceId },
                      },
                    });
                  }
                }
                break;
              }

              case "auto_approve": {
                await this.sql`
                  UPDATE app.workflow_tasks
                  SET status = 'completed',
                      completion_action = 'approve',
                      completion_comment = 'Auto-approved by SLA escalation policy',
                      completed_at = now(),
                      completed_by = ${previousAssignee}::uuid
                  WHERE id = ${taskId}::uuid
                    AND status IN ('pending', 'assigned', 'in_progress', 'escalated')
                `;
                actionDescription = "Auto-approved due to SLA breach";

                if (previousAssignee) {
                  notificationPayloads.push({
                    id: crypto.randomUUID(),
                    type: "notification.in_app",
                    tenantId,
                    data: {
                      userId: previousAssignee,
                      title: "Task Auto-Approved (SLA Breach)",
                      message: `Task "${task.stepName || "Workflow task"}" was auto-approved after SLA breach.`,
                      type: "sla_breach",
                      data: { taskId, instanceId: task.instanceId },
                    },
                  });
                }
                break;
              }

              case "auto_reject": {
                await this.sql`
                  UPDATE app.workflow_tasks
                  SET status = 'completed',
                      completion_action = 'reject',
                      completion_comment = 'Auto-rejected by SLA escalation policy',
                      completed_at = now(),
                      completed_by = ${previousAssignee}::uuid
                  WHERE id = ${taskId}::uuid
                    AND status IN ('pending', 'assigned', 'in_progress', 'escalated')
                `;
                actionDescription = "Auto-rejected due to SLA breach";

                if (previousAssignee) {
                  notificationPayloads.push({
                    id: crypto.randomUUID(),
                    type: "notification.in_app",
                    tenantId,
                    data: {
                      userId: previousAssignee,
                      title: "Task Auto-Rejected (SLA Breach)",
                      message: `Task "${task.stepName || "Workflow task"}" was auto-rejected after SLA breach.`,
                      type: "sla_breach",
                      data: { taskId, instanceId: task.instanceId },
                    },
                  });
                }
                break;
              }

              default:
                actionDescription = `Unknown action: ${action}`;
            }
          } else {
            actionDescription = `Unknown event type: ${eventType}`;
          }

          // Write outbox event for the escalation (atomically traceable)
          await this.sql`
            INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
            VALUES (
              ${crypto.randomUUID()},
              ${tenantId},
              'workflow_task',
              ${taskId}::text,
              ${'workflow.task.sla.' + eventType},
              ${JSON.stringify({
                taskId,
                instanceId: task.instanceId,
                slaId,
                eventType,
                action,
                previousAssignee,
                newAssignee,
                reason: actionDescription,
              })}::jsonb,
              now()
            )
          `;

          // Log the escalation to the audit table
          await this.sql`
            INSERT INTO app.sla_escalation_log (
              id, tenant_id, entity_type, entity_id, action_taken,
              previous_assignee_id, new_assignee_id, reason,
              sla_id, sla_event_id, created_at
            ) VALUES (
              ${crypto.randomUUID()}, ${tenantId}, 'workflow_task', ${taskId}::uuid,
              ${action}, ${previousAssignee}::uuid, ${newAssignee}::uuid,
              ${actionDescription}, ${slaId}::uuid, ${eventId}::uuid, now()
            )
          `;

          // Mark the event as processed
          await this.sql`
            SELECT app.mark_sla_event_processed(
              ${eventId}::uuid,
              ${JSON.stringify({ success: true, action, description: actionDescription })}::jsonb
            )
          `;

          processedCount++;
        } catch (err) {
          console.error(`[Job] Failed to process SLA event ${evt.id}:`, err);

          // Mark event as processed with error so we don't retry indefinitely
          try {
            await this.sql`
              SELECT app.mark_sla_event_processed(
                ${evt.id}::uuid,
                ${JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : "Unknown error",
                })}::jsonb
              )
            `;
          } catch { /* swallow — don't let cleanup error mask the original */ }
        }
      }

      // Batch-send all collected notifications
      if (notificationPayloads.length > 0) {
        await this.batchXAdd(NOTIFICATIONS_STREAM, notificationPayloads);
      }

      console.log(
        `[Job] Workflow SLA escalation complete — processed ${processedCount}/${unprocessed.length} event(s), sent ${notificationPayloads.length} notification(s)`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  /**
   * Check case SLA breaches and auto-escalate.
   *
   * Finds active cases whose SLA resolution deadline has passed (or is
   * approaching the warning threshold), updates their sla_status, bumps
   * the escalation_level to the next tier, reassigns when configured,
   * and sends notifications.
   */
  private async checkCaseSlaBreaches(): Promise<void> {
    console.log("[Job] Starting case SLA breach check...");

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // -----------------------------------------------------------------------
      // Step 1: Mark cases as 'warning' when approaching SLA deadline
      // -----------------------------------------------------------------------
      const warningResult = await this.sql`
        UPDATE app.cases c
        SET sla_status = 'warning',
            updated_at = now()
        FROM app.case_categories cc
        WHERE c.category_id = cc.id
          AND c.sla_status = 'within_sla'
          AND c.status NOT IN ('resolved', 'closed', 'cancelled')
          AND c.sla_resolution_due_at IS NOT NULL
          AND c.sla_paused_at IS NULL
          AND cc.sla_warning_threshold_percent IS NOT NULL
          AND c.sla_resolution_due_at - (
            (c.sla_resolution_due_at - c.created_at)
            * (1.0 - cc.sla_warning_threshold_percent::numeric / 100.0)
          ) < now()
          AND c.sla_resolution_due_at > now()
        RETURNING c.id, c.tenant_id, c.assigned_to, c.case_number, c.subject
      `;

      if (warningResult.length > 0) {
        console.log(`[Job] Marked ${warningResult.length} case(s) as SLA warning`);

        // Send warning notifications to assignees
        const warningPayloads: Array<Record<string, unknown>> = [];
        for (const c of warningResult) {
          if (c.assignedTo) {
            warningPayloads.push({
              id: crypto.randomUUID(),
              type: "notification.in_app",
              tenantId: c.tenantId,
              data: {
                userId: c.assignedTo,
                title: "SLA Warning: Case Approaching Deadline",
                message: `Case ${c.caseNumber} "${c.subject}" is approaching its SLA resolution deadline. Please take action.`,
                type: "sla_warning",
                actionUrl: `/admin/cases/${c.id}`,
                actionText: "View Case",
              },
            });
          }
        }
        if (warningPayloads.length > 0) {
          await this.batchXAdd(NOTIFICATIONS_STREAM, warningPayloads);
        }
      }

      // -----------------------------------------------------------------------
      // Step 2: Find cases that have breached their SLA but not yet escalated
      // -----------------------------------------------------------------------
      const breachedCases = await this.sql`
        SELECT
          c.id,
          c.tenant_id,
          c.case_number,
          c.subject,
          c.status,
          c.assigned_to,
          c.escalation_level,
          c.sla_status,
          c.sla_resolution_due_at,
          c.category_id,
          cc.assignment_config
        FROM app.cases c
        LEFT JOIN app.case_categories cc ON cc.id = c.category_id
        WHERE c.sla_status IN ('within_sla', 'warning')
          AND c.status NOT IN ('resolved', 'closed', 'cancelled')
          AND c.sla_resolution_due_at IS NOT NULL
          AND c.sla_paused_at IS NULL
          AND c.sla_resolution_due_at < now()
        ORDER BY c.sla_resolution_due_at ASC
        LIMIT 100
      `;

      if (breachedCases.length === 0) {
        console.log("[Job] Case SLA breach check complete — no breached cases");
        return;
      }

      console.log(`[Job] Found ${breachedCases.length} case(s) with SLA breach — escalating`);

      let escalatedCount = 0;
      const notificationPayloads: Array<Record<string, unknown>> = [];

      for (const c of breachedCases) {
        try {
          const caseId = c.id as string;
          const tenantId = c.tenantId as string;
          const currentLevel = c.escalationLevel as string;
          const previousAssignee = c.assignedTo as string | null;
          const caseNumber = c.caseNumber as string;
          const subject = c.subject as string;

          // Determine next escalation level
          const nextLevel = this.getNextEscalationLevel(currentLevel);

          // Try to find an escalation target:
          // 1. From the category's assignment_config fallback_assignee_id
          // 2. From the current assignee's manager chain
          let newAssignee: string | null = null;

          // Check category assignment config for fallback escalation target
          const assignmentConfig = c.assignmentConfig as Record<string, unknown> | null;
          if (assignmentConfig?.fallback_assignee_id) {
            newAssignee = assignmentConfig.fallback_assignee_id as string;
          }

          // If no fallback target, try to find the manager of the current assignee
          if (!newAssignee && previousAssignee) {
            newAssignee = await this.findManagerOfUser(previousAssignee, tenantId);
          }

          // Update the case: mark as breached, bump escalation level, optionally reassign
          await this.sql`
            UPDATE app.cases
            SET sla_status = 'breached',
                escalation_level = ${nextLevel}::app.escalation_level,
                escalated_at = now(),
                assigned_to = COALESCE(${newAssignee}::uuid, assigned_to),
                status = CASE WHEN status IN ('open', 'in_progress', 'pending_info') THEN 'escalated' ELSE status END,
                updated_at = now()
            WHERE id = ${caseId}::uuid
          `;

          const reason = `SLA breached — escalated from ${currentLevel} to ${nextLevel}`;

          // Write outbox event
          await this.sql`
            INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
            VALUES (
              ${crypto.randomUUID()}, ${tenantId}, 'case', ${caseId}::text,
              'cases.sla.breached',
              ${JSON.stringify({
                caseId,
                caseNumber,
                previousLevel: currentLevel,
                newLevel: nextLevel,
                previousAssignee,
                newAssignee,
                reason,
              })}::jsonb,
              now()
            )
          `;

          // Log escalation
          await this.sql`
            INSERT INTO app.sla_escalation_log (
              id, tenant_id, entity_type, entity_id, action_taken,
              previous_assignee_id, new_assignee_id, previous_level, new_level,
              reason, created_at
            ) VALUES (
              ${crypto.randomUUID()}, ${tenantId}, 'case', ${caseId}::uuid,
              'escalate_tier', ${previousAssignee}::uuid, ${newAssignee}::uuid,
              ${currentLevel}, ${nextLevel}, ${reason}, now()
            )
          `;

          // Notify the new assignee (if different from previous)
          if (newAssignee && newAssignee !== previousAssignee) {
            notificationPayloads.push({
              id: crypto.randomUUID(),
              type: "notification.in_app",
              tenantId,
              data: {
                userId: newAssignee,
                title: "Case Escalated to You (SLA Breach)",
                message: `Case ${caseNumber} "${subject}" has been escalated to you after SLA breach (${nextLevel}).`,
                type: "sla_breach",
                actionUrl: `/admin/cases/${caseId}`,
                actionText: "View Case",
              },
            });
          }

          // Notify the previous assignee
          if (previousAssignee) {
            notificationPayloads.push({
              id: crypto.randomUUID(),
              type: "notification.in_app",
              tenantId,
              data: {
                userId: previousAssignee,
                title: "Case SLA Breached",
                message: `Case ${caseNumber} "${subject}" has breached its SLA and been escalated to ${nextLevel}.`,
                type: "sla_breach",
                actionUrl: `/admin/cases/${caseId}`,
                actionText: "View Case",
              },
            });
          }

          escalatedCount++;
        } catch (err) {
          console.error(`[Job] Failed to escalate case ${c.id}:`, err);
        }
      }

      // Batch-send all notifications
      if (notificationPayloads.length > 0) {
        await this.batchXAdd(NOTIFICATIONS_STREAM, notificationPayloads);
      }

      console.log(
        `[Job] Case SLA breach check complete — escalated ${escalatedCount}/${breachedCases.length} case(s), sent ${notificationPayloads.length} notification(s)`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  // ---------------------------------------------------------------------------
  // Escalation Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Resolve the best escalation target user ID.
   *
   * Priority order:
   * 1. Explicit user target from SLA config
   * 2. First active member of the target role
   * 3. Manager of the current assignee (via reporting_lines)
   *
   * Returns null if no target can be resolved.
   */
  private async resolveEscalationTarget(
    targetUserId: string | null,
    targetRoleId: string | null,
    currentAssigneeUserId: string | null,
    tenantId: string
  ): Promise<string | null> {
    // 1. Explicit user target
    if (targetUserId) {
      return targetUserId;
    }

    // 2. Resolve from role — pick the first active user assigned to that role
    if (targetRoleId) {
      const [roleMember] = await this.sql`
        SELECT ra.user_id
        FROM app.role_assignments ra
        JOIN app.users u ON u.id = ra.user_id
        WHERE ra.role_id = ${targetRoleId}::uuid
          AND ra.tenant_id = ${tenantId}::uuid
          AND u.status = 'active'
        ORDER BY ra.created_at ASC
        LIMIT 1
      `;
      if (roleMember?.userId) {
        return roleMember.userId as string;
      }
    }

    // 3. Fall back to the current assignee's manager
    if (currentAssigneeUserId) {
      return this.findManagerOfUser(currentAssigneeUserId, tenantId);
    }

    return null;
  }

  /**
   * Find the manager of a given user by traversing reporting_lines.
   *
   * Looks up the employee linked to the user_id, then finds their primary
   * manager, and returns that manager's user_id.
   */
  private async findManagerOfUser(
    userId: string,
    tenantId: string
  ): Promise<string | null> {
    const [manager] = await this.sql`
      SELECT mgr_emp.user_id AS manager_user_id
      FROM app.employees emp
      JOIN app.reporting_lines rl
        ON rl.employee_id = emp.id
        AND rl.tenant_id = emp.tenant_id
        AND rl.is_primary = true
        AND rl.effective_from <= CURRENT_DATE
        AND (rl.effective_to IS NULL OR rl.effective_to > CURRENT_DATE)
      JOIN app.employees mgr_emp
        ON mgr_emp.id = rl.manager_id
        AND mgr_emp.tenant_id = rl.tenant_id
      WHERE emp.user_id = ${userId}::uuid
        AND emp.tenant_id = ${tenantId}::uuid
        AND emp.status = 'active'
        AND mgr_emp.user_id IS NOT NULL
      LIMIT 1
    `;

    return (manager?.managerUserId as string) ?? null;
  }

  /**
   * Determine the next escalation level for a case.
   * Returns the next tier up, capped at tier_4.
   */
  private getNextEscalationLevel(current: string): string {
    const levels = ["none", "tier_1", "tier_2", "tier_3", "tier_4"];
    const idx = levels.indexOf(current);
    if (idx < 0 || idx >= levels.length - 1) {
      return "tier_4"; // cap at highest tier
    }
    return levels[idx + 1]!;
  }

  /**
   * Detect and repair drift between Better Auth "user" table and app.users.
   * Runs hourly to catch any rows that diverged due to failed databaseHooks.
   * Repairs are applied in batches to avoid locking issues.
   *
   * Checks three categories of drift:
   * 1. Missing rows  — user exists in app."user" but not in app.users
   * 2. Drifted fields — email, name, status, mfaEnabled, or emailVerified differ
   * 3. Orphaned rows  — user exists in app.users but not in app."user" (report only)
   *
   * The DB trigger (0192_user_table_sync_trigger.sql) provides a synchronous
   * safety net, but this job catches anything that slipped through.
   */
  private async detectUserTableDrift(): Promise<void> {
    console.log("[Job] Starting user table drift detection...");

    let missingRepaired = 0;
    let missingFailed = 0;
    let driftRepaired = 0;
    let driftFailed = 0;
    let orphanedCount = 0;

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // ---- Phase 1: Find users in Better Auth table missing from app.users ----
      const missing = await this.sql`
        SELECT ba.id, ba.email, ba.name, ba.status, ba."mfaEnabled",
               COALESCE(ba."emailVerified", false) AS "emailVerified"
        FROM app."user" ba
        LEFT JOIN app.users au ON au.id = ba.id::uuid
        WHERE au.id IS NULL
        LIMIT 200
      `;

      if (missing.length > 0) {
        console.warn(`[Job] Found ${missing.length} users in Better Auth missing from app.users — repairing`);
        for (const row of missing) {
          try {
            await this.sql`
              INSERT INTO app.users (id, email, email_verified, name, status, mfa_enabled, created_at, updated_at)
              VALUES (
                ${row.id}::uuid, ${row.email}, ${row.emailVerified ?? false},
                ${row.name ?? row.email}, ${row.status ?? 'active'},
                ${row.mfaEnabled ?? false}, now(), now()
              )
              ON CONFLICT (id) DO NOTHING
            `;
            missingRepaired++;
          } catch (err) {
            missingFailed++;
            console.error(`[Job] Failed to repair missing user ${row.id}:`,
              err instanceof Error ? err.message : String(err));
          }
        }
      }

      // ---- Phase 2: Find users with drifted fields ----
      const drifted = await this.sql`
        SELECT ba.id, ba.email, ba.name, ba.status, ba."mfaEnabled",
               COALESCE(ba."emailVerified", false) AS "emailVerified"
        FROM app."user" ba
        JOIN app.users au ON au.id = ba.id::uuid
        WHERE ba.email != au.email
           OR ba.name IS DISTINCT FROM au.name
           OR COALESCE(ba.status, 'active') != COALESCE(au.status, 'active')
           OR COALESCE(ba."mfaEnabled", false) != COALESCE(au.mfa_enabled, false)
           OR COALESCE(ba."emailVerified", false) != COALESCE(au.email_verified, false)
        LIMIT 200
      `;

      if (drifted.length > 0) {
        console.warn(`[Job] Found ${drifted.length} users with drifted fields — repairing`);
        for (const row of drifted) {
          try {
            await this.sql`
              UPDATE app.users SET
                email = ${row.email},
                name = ${row.name ?? row.email},
                status = ${row.status ?? 'active'},
                mfa_enabled = ${row.mfaEnabled ?? false},
                email_verified = ${row.emailVerified ?? false},
                updated_at = now()
              WHERE id = ${row.id}::uuid
            `;
            driftRepaired++;
          } catch (err) {
            driftFailed++;
            console.error(`[Job] Failed to repair drifted user ${row.id}:`,
              err instanceof Error ? err.message : String(err));
          }
        }
      }

      // ---- Phase 3: Detect orphaned rows in app.users (report only) ----
      const orphaned = await this.sql`
        SELECT au.id::text AS id, au.email
        FROM app.users au
        LEFT JOIN app."user" ba ON ba.id = au.id::text
        WHERE ba.id IS NULL
        LIMIT 200
      `;

      orphanedCount = orphaned.length;
      if (orphanedCount > 0) {
        console.warn(
          `[Job] Found ${orphanedCount} user(s) in app.users with no matching app."user" row. ` +
          "These may be pre-BetterAuth legacy users. Sample IDs: " +
          orphaned.slice(0, 5).map(r => `${r.id} (${r.email})`).join(", ")
        );
      }
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }

    // ---- Summary ----
    const totalRepaired = missingRepaired + driftRepaired;
    const totalFailed = missingFailed + driftFailed;

    if (totalRepaired === 0 && totalFailed === 0 && orphanedCount === 0) {
      console.log("[Job] User table drift detection complete — no drift found");
    } else {
      console.log(
        `[Job] User table drift detection complete — ` +
        `repaired: ${totalRepaired}, failed: ${totalFailed}, orphaned: ${orphanedCount}`
      );
    }
  }

  /**
   * Run scheduled reports that are due.
   * Finds active report schedules whose next_run_at is in the past,
   * executes them, and updates the next run time.
   */
  private async runScheduledReports(): Promise<void> {
    console.log("[Job] Starting scheduled report runner...");

    const dueSchedules = await this.sql`
      SELECT
        rs.id AS schedule_id,
        rs.report_id,
        rs.tenant_id,
        rs.created_by,
        rs.frequency,
        rs.export_format,
        rs.recipients,
        rs.next_run_at
      FROM app.report_schedules rs
      JOIN app.report_definitions rd ON rd.id = rs.report_id
      WHERE rs.is_active = true
        AND rs.next_run_at <= now()
        AND rd.status != 'archived'
      ORDER BY rs.next_run_at ASC
      LIMIT 20
    `;

    if (dueSchedules.length === 0) {
      console.log("[Job] Scheduled report runner complete — no reports due");
      return;
    }

    console.log(`[Job] Found ${dueSchedules.length} scheduled report(s) to run`);

    let successCount = 0;
    for (const schedule of dueSchedules) {
      try {
        // Execute the report — track execution ID for status updates
        const executionId = crypto.randomUUID();
        await this.sql`
          INSERT INTO app.report_executions (
            id, tenant_id, report_id, executed_by, status, parameters, created_at
          ) VALUES (
            ${executionId},
            ${schedule.tenantId},
            ${schedule.reportId},
            ${schedule.createdBy},
            'running',
            '{}'::jsonb,
            now()
          )
        `;

        // Calculate next run time based on frequency
        let intervalExpr: string;
        switch (schedule.frequency) {
          case "daily":   intervalExpr = "1 day"; break;
          case "weekly":  intervalExpr = "7 days"; break;
          case "monthly": intervalExpr = "1 month"; break;
          default:        intervalExpr = "1 day"; break;
        }

        // Update next_run_at and last_run_at
        await this.sql`
          UPDATE app.report_schedules
          SET last_run_at = now(),
              next_run_at = now() + ${intervalExpr}::interval,
              updated_at = now()
          WHERE id = ${schedule.scheduleId}::uuid
        `;

        // Send notification to recipients if configured
        const recipients = schedule.recipients;
        if (Array.isArray(recipients) && recipients.length > 0) {
          for (const recipient of recipients) {
            await this.redis.xadd(
              NOTIFICATIONS_STREAM,
              "*",
              "payload",
              JSON.stringify({
                id: crypto.randomUUID(),
                type: "notification.email",
                tenantId: schedule.tenantId,
                data: {
                  to: recipient,
                  subject: "Scheduled Report Ready",
                  message: `Your scheduled report is ready for download.`,
                  data: { reportId: schedule.reportId, scheduleId: schedule.scheduleId },
                },
              }),
              "attempt",
              "1"
            );
          }
        }

        // Mark execution as completed
        await this.sql`
          UPDATE app.report_executions
          SET status = 'completed',
              completed_at = now()
          WHERE id = ${executionId}::uuid
        `;

        successCount++;
      } catch (err) {
        console.error(`[Job] Failed to run scheduled report ${schedule.reportId}:`, err);

        // Mark execution as failed — use executionId if available
        await this.sql`
          UPDATE app.report_executions
          SET status = 'failed',
              error_message = ${err instanceof Error ? err.message : "Unknown error"},
              completed_at = now()
          WHERE report_id = ${schedule.reportId}::uuid
            AND status = 'running'
        `.catch(() => {});
      }
    }

    console.log(`[Job] Scheduled report runner complete — ran ${successCount}/${dueSchedules.length} report(s)`);
  }

  /**
   * Calculate daily usage stats for all active tenants.
   * Collects active user counts, employee counts, and optionally
   * API request counters from Redis (keyed by tenant).
   */
  private async calculateTenantUsageStats(): Promise<void> {
    console.log("[Job] Starting tenant usage stats aggregation...");

    // Yesterday's date — we aggregate stats for the previous full day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0]!;

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Get all active tenants
      const tenants = await this.sql<{ id: string; name: string }[]>`
        SELECT id, name FROM app.tenants WHERE status = 'active'
      `;

      if (tenants.length === 0) {
        console.log("[Job] Tenant usage stats complete — no active tenants");
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const tenant of tenants) {
        try {
          // Set tenant context for RLS-scoped queries
          await this.sql`SELECT app.set_tenant_context(${tenant.id}::uuid, NULL::uuid)`;

          // Count active users (users with sessions active yesterday)
          const [activeUsersRow] = await this.sql<{ count: number }[]>`
            SELECT COUNT(DISTINCT u.id)::integer AS count
            FROM app.users u
            JOIN app."session" s ON s."userId" = u.id::text
            WHERE u.tenant_id = ${tenant.id}::uuid
              AND s."expiresAt" >= ${dateStr}::date
              AND s."createdAt" <= (${dateStr}::date + interval '1 day')
          `;

          // Count active employees
          const [employeeCountRow] = await this.sql<{ count: number }[]>`
            SELECT COUNT(*)::integer AS count
            FROM app.employees
            WHERE tenant_id = ${tenant.id}::uuid
              AND status IN ('active', 'on_leave')
          `;

          // Try to read API request counter from Redis (set by rate limiter / metrics plugin)
          let apiRequests = 0;
          let storageBytes = 0;
          const moduleUsage: Record<string, number> = {};

          try {
            const apiCountKey = `staffora:usage:api_requests:${tenant.id}:${dateStr}`;
            const apiCountStr = await this.redis.get(apiCountKey);
            if (apiCountStr) {
              apiRequests = parseInt(apiCountStr, 10) || 0;
            }

            const storageKey = `staffora:usage:storage_bytes:${tenant.id}`;
            const storageStr = await this.redis.get(storageKey);
            if (storageStr) {
              storageBytes = parseInt(storageStr, 10) || 0;
            }

            // Read per-module request counters
            const moduleCountPattern = `staffora:usage:module:${tenant.id}:${dateStr}:*`;
            const moduleKeys = await this.redis.keys(moduleCountPattern);
            for (const key of moduleKeys) {
              const moduleName = key.split(":").pop() || "unknown";
              const countStr = await this.redis.get(key);
              if (countStr) {
                moduleUsage[moduleName] = parseInt(countStr, 10) || 0;
              }
            }
          } catch {
            // Redis counters are optional; continue with defaults
          }

          const activeUsers = Number(activeUsersRow?.count ?? 0);
          const employeeCount = Number(employeeCountRow?.count ?? 0);

          // Upsert the daily stats row
          await this.sql`
            INSERT INTO app.tenant_usage_stats (
              id,
              tenant_id,
              period_start,
              period_end,
              active_users,
              api_requests,
              storage_bytes,
              employee_count,
              module_usage,
              created_at
            ) VALUES (
              gen_random_uuid(),
              ${tenant.id}::uuid,
              ${dateStr}::date,
              ${dateStr}::date,
              ${activeUsers},
              ${apiRequests},
              ${storageBytes},
              ${employeeCount},
              ${JSON.stringify(moduleUsage)}::jsonb,
              now()
            )
            ON CONFLICT (tenant_id, period_start, period_end)
            DO UPDATE SET
              active_users   = EXCLUDED.active_users,
              api_requests   = EXCLUDED.api_requests,
              storage_bytes  = EXCLUDED.storage_bytes,
              employee_count = EXCLUDED.employee_count,
              module_usage   = EXCLUDED.module_usage
          `;

          successCount++;
        } catch (err) {
          errorCount++;
          console.error(
            `[Job] Failed to calculate usage stats for tenant ${tenant.id} (${tenant.name}):`,
            err
          );
        }
      }

      console.log(
        `[Job] Tenant usage stats complete — ` +
        `${successCount} succeeded, ${errorCount} failed out of ${tenants.length} tenants`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  /**
   * Run automated data archival across all active tenants.
   *
   * For each tenant, reads the enabled archival_rules and moves records
   * that exceed their retention period into the archived_records table.
   * Runs weekly on Sunday at 4 AM to minimise production impact.
   */
  private async runDataArchival() {
    console.log("[Job] Running data archival...");

    await this.sql`SELECT app.enable_system_context()`;
    try {
      // Get all active tenants
      const tenants = await this.sql<{ id: string }[]>`
        SELECT id FROM app.tenants WHERE status = 'active' LIMIT 1000
      `;

      let totalArchived = 0;
      let totalSkipped = 0;
      let errorCount = 0;

      for (const tenant of tenants) {
        try {
          // Set tenant context for RLS
          await this.sql`SELECT app.set_tenant_context(${tenant.id}::uuid)`;

          // Get enabled archival rules for this tenant
          const rules = await this.sql<
            Array<{
              id: string;
              sourceCategory: string;
              sourceTable: string;
              statusColumn: string | null;
              statusValue: string | null;
              dateColumn: string;
              retentionYears: number;
            }>
          >`
            SELECT
              id, source_category, source_table,
              status_column, status_value,
              date_column, retention_years
            FROM app.archival_rules
            WHERE enabled = true
          `;

          for (const rule of rules) {
            try {
              const cutoffDate = new Date();
              cutoffDate.setFullYear(
                cutoffDate.getFullYear() - rule.retentionYears
              );

              // Find eligible records (batch of 200 per rule per tenant)
              // Use sql.unsafe() for dynamic table/column identifiers
              const escIdent = (name: string) =>
                name.split(".").map((p) => `"${p}"`).join(".");
              const tbl = escIdent(rule.sourceTable);
              const dtCol = escIdent(rule.dateColumn);

              let eligibleQuery: Array<{ id: string }>;
              if (rule.statusColumn && rule.statusValue) {
                const stCol = escIdent(rule.statusColumn);
                eligibleQuery = await this.sql.unsafe<Array<{ id: string }>>(
                  `SELECT t.id::text as id
                   FROM ${tbl} t
                   LEFT JOIN app.archived_records ar
                     ON ar.source_table = $1
                     AND ar.source_id = t.id
                     AND ar.status = 'archived'
                   WHERE ar.id IS NULL
                     AND t.${stCol} = $2
                     AND t.${dtCol} < $3
                   LIMIT 200`,
                  [rule.sourceTable, rule.statusValue, cutoffDate]
                );
              } else {
                eligibleQuery = await this.sql.unsafe<Array<{ id: string }>>(
                  `SELECT t.id::text as id
                   FROM ${tbl} t
                   LEFT JOIN app.archived_records ar
                     ON ar.source_table = $1
                     AND ar.source_id = t.id
                     AND ar.status = 'archived'
                   WHERE ar.id IS NULL
                     AND t.${dtCol} < $2
                   LIMIT 200`,
                  [rule.sourceTable, cutoffDate]
                );
              }

              for (const record of eligibleQuery) {
                try {
                  // Fetch full record data
                  const [sourceRow] = await this.sql.unsafe<Array<{ data: unknown }>>(
                    `SELECT row_to_json(t.*) as data FROM ${tbl} t WHERE t.id = $1::uuid LIMIT 1`,
                    [record.id]
                  );

                  if (!sourceRow?.data) {
                    totalSkipped++;
                    continue;
                  }

                  const retentionUntil = new Date();
                  retentionUntil.setFullYear(
                    retentionUntil.getFullYear() + rule.retentionYears
                  );

                  // Archive: insert into archived_records + delete source
                  // in a single transaction
                  await this.sql.begin(async (tx) => {
                    await tx`
                      INSERT INTO app.archived_records (
                        id, tenant_id, source_table, source_id,
                        source_category, archived_data,
                        archived_by, retention_until
                      )
                      VALUES (
                        gen_random_uuid(),
                        ${tenant.id}::uuid,
                        ${rule.sourceTable},
                        ${record.id}::uuid,
                        ${rule.sourceCategory}::app.archival_source_category,
                        ${JSON.stringify(sourceRow.data)}::jsonb,
                        NULL,
                        ${retentionUntil}
                      )
                    `;

                    await tx.unsafe(
                      `DELETE FROM ${tbl} WHERE id = $1::uuid`,
                      [record.id]
                    );

                    // Outbox event
                    await tx`
                      INSERT INTO app.domain_outbox (
                        id, tenant_id, aggregate_type, aggregate_id,
                        event_type, payload, created_at
                      )
                      VALUES (
                        gen_random_uuid(),
                        ${tenant.id}::uuid,
                        'archived_record',
                        ${record.id}::uuid,
                        'data.archival.record_archived',
                        ${JSON.stringify({
                          sourceTable: rule.sourceTable,
                          sourceId: record.id,
                          sourceCategory: rule.sourceCategory,
                          actor: null,
                          automated: true,
                        })}::jsonb,
                        now()
                      )
                    `;
                  });

                  totalArchived++;
                } catch (recordErr) {
                  // Individual record failure should not stop the batch
                  totalSkipped++;
                }
              }
            } catch (ruleErr) {
              console.warn(
                `[Job] Data archival rule ${rule.id} failed for tenant ${tenant.id}:`,
                ruleErr
              );
              errorCount++;
            }
          }
        } catch (tenantErr) {
          console.warn(
            `[Job] Data archival failed for tenant ${tenant.id}:`,
            tenantErr
          );
          errorCount++;
        }
      }

      console.log(
        `[Job] Data archival complete — ${totalArchived} archived, ` +
        `${totalSkipped} skipped, ${errorCount} errors across ${tenants.length} tenants`
      );
    } finally {
      await this.sql`SELECT app.disable_system_context()`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Refresh dashboard materialized views.
   */
  private async refreshDashboardStats(): Promise<void> {
    try {
      await this.sql`SELECT app.enable_system_context()`;
      await this.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_dashboard_employee_stats`;
      await this.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_dashboard_leave_stats`;
      await this.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_dashboard_case_stats`;
      await this.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_dashboard_onboarding_stats`;
      await this.sql`SELECT app.disable_system_context()`;
      console.log("[Scheduler] Dashboard stats refreshed");
    } catch (err) {
      console.error("[Scheduler] Failed to refresh dashboard stats:", err);
    }
  }
}

// Main entry point
const scheduler = new Scheduler();

// Graceful shutdown
process.on("SIGINT", async () => {
  await scheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await scheduler.stop();
  process.exit(0);
});

// Start scheduler
scheduler.start().catch((error) => {
  console.error("[Scheduler] Fatal error:", error);
  process.exit(1);
});

export { Scheduler };
