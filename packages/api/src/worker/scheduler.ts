/**
 * Scheduled Jobs Worker
 *
 * Runs periodic tasks like leave balance accruals, timesheet reminders,
 * report generation, and data cleanup.
 */

import postgres from "postgres";
import Redis from "ioredis";
import { getDatabaseUrl, getRedisUrl } from "../config/database";
import { StreamKeys } from "../jobs/base";

// FIX: Using centralized configuration to prevent password mismatch issues
// All database defaults are now managed in src/config/database.ts
const DB_URL = getDatabaseUrl();
const REDIS_URL = getRedisUrl();

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
  private running = false;
  private jobs: ScheduledJob[] = [];
  private checkInterval = 60000; // Check every minute

  constructor() {
    this.sql = postgres(DB_URL, { transform: postgres.toCamel });
    this.redis = new Redis(REDIS_URL);
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
    await this.redis.quit();
    await this.sql.end();
  }

  // Simple cron parser (basic implementation)
  private getNextRunTime(cron: string): Date {
    const [minute, hour, dayOfMonth, _month, dayOfWeek] = cron.split(" ");
    const now = new Date();
    const next = new Date(now);

    // Set to the next occurrence (simplified logic)
    next.setMinutes(parseInt(minute ?? "0"));
    next.setHours(parseInt(hour ?? "0"));
    next.setSeconds(0);
    next.setMilliseconds(0);

    // If the time has passed today, move to next day
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Handle day of week
    if (dayOfWeek !== "*") {
      const targetDay = parseInt(dayOfWeek ?? "0");
      while (next.getDay() !== targetDay) {
        next.setDate(next.getDate() + 1);
      }
    }

    // Handle day of month
    if (dayOfMonth !== "*") {
      next.setDate(parseInt(dayOfMonth ?? "1"));
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
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
            ).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return `- ${name} (${monthDay})`;
          })
          .join("\n");

        const monthName = new Date().toLocaleDateString("en-US", {
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
