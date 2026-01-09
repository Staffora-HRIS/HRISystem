/**
 * Scheduled Jobs Worker
 *
 * Runs periodic tasks like leave balance accruals, timesheet reminders,
 * report generation, and data cleanup.
 */

import postgres from "postgres";
import Redis from "ioredis";
import { getDatabaseUrl, getRedisUrl } from "../config/database";

// FIX: Using centralized configuration to prevent password mismatch issues
// All database defaults are now managed in src/config/database.ts
const DB_URL = getDatabaseUrl();
const REDIS_URL = getRedisUrl();

// Stream keys for notifications
const NOTIFICATIONS_STREAM = "hris:notifications";

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

    // Monthly jobs
    this.jobs.push({
      name: "birthday-notifications",
      cronExpression: "0 8 1 * *", // 8 AM on 1st of month
      lastRun: null,
      nextRun: this.getNextRunTime("0 8 1 * *"),
      handler: this.generateBirthdayNotifications.bind(this),
    });
  }

  async start() {
    console.log("[Scheduler] Starting...");
    this.running = true;

    while (this.running) {
      const now = new Date();

      for (const job of this.jobs) {
        if (job.nextRun <= now) {
          console.log(`[Scheduler] Running job: ${job.name}`);

          try {
            await job.handler();
            job.lastRun = now;
            console.log(`[Scheduler] Completed job: ${job.name}`);
          } catch (error) {
            console.error(`[Scheduler] Error in job ${job.name}:`, error);
          }

          // Calculate next run time
          job.nextRun = this.getNextRunTime(job.cronExpression);
          console.log(`[Scheduler] Next run for ${job.name}: ${job.nextRun.toISOString()}`);
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

  // Job Handlers

  private async accrueLeaveBalances() {
    console.log("[Job] Accruing leave balances...");

    // Get all active leave policies with accrual rules
    const policies = await this.sql`
      SELECT DISTINCT lp.*, t.id as tenant_id
      FROM app.leave_policies lp
      JOIN app.tenants t ON t.id = lp.tenant_id
      WHERE lp.accrual_frequency IS NOT NULL
        AND t.status = 'active'
    `;

    for (const policy of policies) {
      // Get employees under this policy
      const employees = await this.sql`
        SELECT lb.* FROM app.leave_balances lb
        JOIN app.employees e ON e.id = lb.employee_id
        WHERE lb.leave_type_id = ${policy["leaveTypeId"]}::uuid
          AND lb.year = ${new Date().getFullYear()}
          AND e.status = 'active'
      `;

      for (const emp of employees) {
        // Calculate accrual amount based on frequency
        const accrualAmount = policy["accrualRate"] || 0;

        // Update balance
        await this.sql`
          UPDATE app.leave_balances
          SET accrued = accrued + ${accrualAmount},
              balance = balance + ${accrualAmount},
              updated_at = now()
          WHERE id = ${emp["id"]}::uuid
        `;
      }
    }

    console.log(`[Job] Processed leave accruals for ${policies.length} policies`);
  }

  private async sendTimesheetReminders() {
    console.log("[Job] Sending timesheet reminders...");

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
    `;

    console.log(`[Job] Found ${pending.length} employees needing timesheet reminders`);

    // Send reminder emails and in-app notifications
    for (const emp of pending) {
      const firstName = emp["firstName"] || "Team Member";
      const email = emp["email"];
      const userId = emp["userId"];
      const tenantId = emp["tenantId"];

      // Send in-app notification
      if (userId) {
        await this.redis.xadd(
          NOTIFICATIONS_STREAM,
          "*",
          "payload",
          JSON.stringify({
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
          }),
          "attempt",
          "1"
        );
      }

      // Send email notification
      if (email) {
        await this.redis.xadd(
          NOTIFICATIONS_STREAM,
          "*",
          "payload",
          JSON.stringify({
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
                actionUrl: `${process.env["APP_URL"] || "https://app.hris.local"}/employee/time`,
                actionText: "Submit Timesheet",
              },
            },
          }),
          "attempt",
          "1"
        );
      }
    }

    console.log(`[Job] Sent timesheet reminders to ${pending.length} employees`);
  }

  private async cleanupExpiredSessions() {
    console.log("[Job] Cleaning up expired sessions...");

    const result = await this.sql`
      DELETE FROM app.sessions
      WHERE expires_at < now() - interval '7 days'
    `;

    console.log(`[Job] Deleted ${result.count} expired sessions`);
  }

  private async cleanupProcessedOutbox() {
    console.log("[Job] Cleaning up processed outbox events...");

    const result = await this.sql`
      DELETE FROM app.domain_outbox
      WHERE processed_at < now() - interval '30 days'
    `;

    console.log(`[Job] Deleted ${result.count} old outbox events`);
  }

  private async checkReviewDeadlines() {
    console.log("[Job] Checking review deadlines...");

    // Find upcoming review deadlines and affected employees
    const upcoming = await this.sql`
      SELECT
        rc.id as cycle_id,
        rc.name as cycle_name,
        rc.self_review_deadline,
        rc.manager_review_deadline,
        rc.tenant_id,
        r.id as review_id,
        r.employee_id,
        r.reviewer_id,
        r.status as review_status,
        u.id as user_id,
        u.email,
        ep.first_name
      FROM app.performance_reviews r
      JOIN app.review_cycles rc ON rc.id = r.cycle_id
      JOIN app.employees e ON e.id = r.employee_id
      LEFT JOIN app.users u ON u.id = e.user_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
      WHERE rc.status = 'active'
        AND r.status IN ('pending', 'in_progress')
        AND (
          (rc.self_review_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '3 days' AND r.review_type = 'self')
          OR (rc.manager_review_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '3 days' AND r.review_type = 'manager')
        )
    `;

    console.log(`[Job] Found ${upcoming.length} pending reviews with upcoming deadlines`);

    // Send deadline reminder notifications
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

      // Send in-app notification
      if (userId) {
        await this.redis.xadd(
          NOTIFICATIONS_STREAM,
          "*",
          "payload",
          JSON.stringify({
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
          }),
          "attempt",
          "1"
        );
      }

      // Send email notification
      if (email) {
        await this.redis.xadd(
          NOTIFICATIONS_STREAM,
          "*",
          "payload",
          JSON.stringify({
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
                actionUrl: `${process.env["APP_URL"] || "https://app.hris.local"}/employee/performance/reviews/${review["reviewId"]}`,
                actionText: "Complete Review",
              },
            },
          }),
          "attempt",
          "1"
        );
      }
    }

    console.log(`[Job] Sent ${upcoming.length} review deadline reminders`);
  }

  private async generateBirthdayNotifications() {
    console.log("[Job] Generating birthday notifications...");

    // Find birthdays this month and notify HR admins
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

    // Group by tenant
    type BirthdayRow = (typeof birthdays)[number];
    const byTenant = new Map<string, BirthdayRow[]>();
    for (const bday of birthdays) {
      const tenantId = bday["tenantId"] as string;
      if (!byTenant.has(tenantId)) {
        byTenant.set(tenantId, []);
      }
      byTenant.get(tenantId)!.push(bday);
    }

    // For each tenant, find HR admins and notify them
    for (const [tenantId, tenantBirthdays] of byTenant) {
      // Find users with HR admin permissions
      const hrAdmins = await this.sql`
        SELECT DISTINCT u.id as user_id, u.email
        FROM app.users u
        JOIN app.role_assignments ra ON ra.user_id = u.id
        JOIN app.roles r ON r.id = ra.role_id
        WHERE ra.tenant_id = ${tenantId}::uuid
          AND r.name IN ('HR Admin', 'HR Manager', 'System Admin')
          AND u.status = 'active'
      `;

      if (hrAdmins.length === 0) continue;

      // Build birthday list message
      const birthdayList = tenantBirthdays
        .map((b) => {
          const day = b["birthDay"];
          const name = `${b["firstName"] || ""} ${b["lastName"] || ""}`.trim() || "Employee";
          const monthDay = new Date(2000, new Date().getMonth(), Number(day)).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          return `- ${name} (${monthDay})`;
        })
        .join("\n");

      const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

      // Notify each HR admin
      for (const admin of hrAdmins) {
        const userId = admin["userId"];
        const email = admin["email"];

        // Send in-app notification
        if (userId) {
          await this.redis.xadd(
            NOTIFICATIONS_STREAM,
            "*",
            "payload",
            JSON.stringify({
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
            }),
            "attempt",
            "1"
          );
        }

        // Send email with birthday list
        if (email) {
          await this.redis.xadd(
            NOTIFICATIONS_STREAM,
            "*",
            "payload",
            JSON.stringify({
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
                  actionUrl: `${process.env["APP_URL"] || "https://app.hris.local"}/admin/reports/birthdays`,
                  actionText: "View Full Report",
                },
              },
            }),
            "attempt",
            "1"
          );
        }
      }
    }

    console.log(`[Job] Sent birthday notifications to ${byTenant.size} tenants`);
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
