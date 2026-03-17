/**
 * Notification Worker
 *
 * Handles sending notifications through various channels:
 * - Email notifications (using mailer abstraction)
 * - In-app notifications (stored in database)
 * - Push notifications via two parallel channels:
 *   - Web Push (VAPID/RFC 8292) using the web-push library (push_subscriptions table)
 *   - Firebase Cloud Messaging (FCM) using firebase-admin (push_tokens table)
 *
 * Features:
 * - Template-based message rendering
 * - Multi-channel delivery (email, in-app, Web Push, FCM)
 * - Delivery tracking with per-channel metrics
 * - Automatic cleanup of expired/invalid subscriptions and tokens
 * - Rate limiting awareness
 * - Bulk notification support
 *
 * Environment variables for Web Push (VAPID):
 * - VAPID_PUBLIC_KEY  — VAPID public key (base64url-encoded)
 * - VAPID_PRIVATE_KEY — VAPID private key (base64url-encoded)
 * - VAPID_SUBJECT     — mailto: or URL identifying the application server
 *
 * Environment variables for Firebase (FCM):
 * - FIREBASE_SERVICE_ACCOUNT_PATH — Path to Firebase service account JSON
 * - FIREBASE_SERVICE_ACCOUNT_JSON — Firebase service account JSON string
 */

import {
  type JobPayload,
  type JobContext,
  type ProcessorRegistration,
  JobTypes,
} from "./base";

// =============================================================================
// Types
// =============================================================================

/**
 * Notification channel types
 */
export type NotificationChannel = "email" | "in_app" | "push";

/**
 * Notification priority levels
 */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * Email notification payload
 */
export interface EmailNotificationPayload {
  /** Recipient email address */
  to: string;
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Email subject */
  subject: string;
  /** Template name to use */
  template?: string;
  /** Template variables */
  templateData?: Record<string, unknown>;
  /** Plain text body (if no template) */
  textBody?: string;
  /** HTML body (if no template) */
  htmlBody?: string;
  /** Attachments */
  attachments?: Array<{
    filename: string;
    content: string; // Base64 encoded
    contentType: string;
  }>;
  /** Reply-to address */
  replyTo?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * In-app notification payload
 */
export interface InAppNotificationPayload {
  /** Target user ID */
  userId: string;
  /** Notification title */
  title: string;
  /** Notification message */
  message: string;
  /** Notification type/category */
  type: string;
  /** Link to relevant resource */
  actionUrl?: string;
  /** Action button text */
  actionText?: string;
  /** Icon to display */
  icon?: string;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Expiration time */
  expiresAt?: string;
}

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
  /** Target user ID */
  userId: string;
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Icon URL */
  icon?: string;
  /** Badge count */
  badge?: number;
  /** Sound to play */
  sound?: string;
  /** Click action URL */
  clickAction?: string;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Time to live (seconds) */
  ttl?: number;
}

/**
 * Unified notification payload
 */
export interface NotificationPayload {
  /** Channels to send through */
  channels: NotificationChannel[];
  /** Priority level */
  priority?: NotificationPriority;
  /** Email-specific payload */
  email?: EmailNotificationPayload;
  /** In-app specific payload */
  inApp?: InAppNotificationPayload;
  /** Push-specific payload */
  push?: PushNotificationPayload;
  /** Deduplication key */
  deduplicationKey?: string;
  /** Schedule time (ISO string) */
  scheduledAt?: string;
}

/**
 * Notification delivery result
 */
export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: string;
}

// =============================================================================
// Mailer Abstraction
// =============================================================================

/**
 * Mailer interface for email delivery
 * Implement this interface with your preferred email provider
 */
export interface Mailer {
  send(email: EmailNotificationPayload): Promise<{ messageId: string }>;
  sendBulk?(emails: EmailNotificationPayload[]): Promise<Array<{ messageId: string }>>;
}

/**
 * Console mailer for development (logs emails instead of sending)
 */
export class ConsoleMailer implements Mailer {
  async send(email: EmailNotificationPayload): Promise<{ messageId: string }> {
    const messageId = `dev-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log("[ConsoleMailer] Would send email:");
    console.log(`  To: ${email.to}`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  Template: ${email.template || "none"}`);
    if (email.textBody) {
      console.log(`  Body: ${email.textBody.substring(0, 200)}...`);
    }
    return { messageId };
  }

  async sendBulk(emails: EmailNotificationPayload[]): Promise<Array<{ messageId: string }>> {
    return Promise.all(emails.map((email) => this.send(email)));
  }
}

/**
 * SMTP mailer implementation using nodemailer
 */
export class SmtpMailer implements Mailer {
  private config: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    from: string;
  };
  private transporter: import("nodemailer").Transporter | null = null;

  constructor() {
    this.config = {
      host: process.env["SMTP_HOST"] || "localhost",
      port: Number(process.env["SMTP_PORT"]) || 587,
      secure: process.env["SMTP_SECURE"] === "true",
      auth: {
        user: process.env["SMTP_USER"] || "",
        pass: process.env["SMTP_PASS"] || "",
      },
      from: process.env["SMTP_FROM"] || "noreply@staffora.co.uk",
    };
  }

  private async getTransporter(): Promise<import("nodemailer").Transporter> {
    if (!this.transporter) {
      const nodemailer = await import("nodemailer");
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.auth.user
          ? {
              user: this.config.auth.user,
              pass: this.config.auth.pass,
            }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(email: EmailNotificationPayload): Promise<{ messageId: string }> {
    const transporter = await this.getTransporter();

    const mailOptions: import("nodemailer/lib/mailer").Options = {
      from: this.config.from,
      to: email.to,
      cc: email.cc?.join(", "),
      bcc: email.bcc?.join(", "),
      subject: email.subject,
      text: email.textBody,
      html: email.htmlBody,
      replyTo: email.replyTo,
      headers: email.headers,
      attachments: email.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      })),
    };

    const result = await transporter.sendMail(mailOptions);
    return { messageId: result.messageId || `smtp-${Date.now()}` };
  }

  async sendBulk(emails: EmailNotificationPayload[]): Promise<Array<{ messageId: string }>> {
    return Promise.all(emails.map((email) => this.send(email)));
  }
}

// Get the appropriate mailer based on environment
function getMailer(): Mailer {
  if (process.env["NODE_ENV"] === "production") {
    return new SmtpMailer();
  }
  return new ConsoleMailer();
}

// =============================================================================
// Template Engine
// =============================================================================

/**
 * Email template definitions
 */
const EMAIL_TEMPLATES: Record<string, { subject: string; html: string; text: string }> = {
  // Welcome email
  welcome: {
    subject: "Welcome to {{companyName}}!",
    html: `
      <h1>Welcome to {{companyName}}, {{firstName}}!</h1>
      <p>Your account has been created successfully.</p>
      <p>You can log in at: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
    `,
    text: `
Welcome to {{companyName}}, {{firstName}}!

Your account has been created successfully.
You can log in at: {{loginUrl}}
    `,
  },

  // Password reset
  password_reset: {
    subject: "Password Reset Request",
    html: `
      <h1>Password Reset</h1>
      <p>Hi {{firstName}},</p>
      <p>We received a request to reset your password.</p>
      <p>Click here to reset: <a href="{{resetUrl}}">Reset Password</a></p>
      <p>This link expires in {{expiresIn}}.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `
Password Reset

Hi {{firstName}},

We received a request to reset your password.
Click here to reset: {{resetUrl}}

This link expires in {{expiresIn}}.
If you didn't request this, please ignore this email.
    `,
  },

  // Leave request notification
  leave_request: {
    subject: "Leave Request: {{employeeName}} - {{leaveType}}",
    html: `
      <h1>Leave Request Submitted</h1>
      <p><strong>Employee:</strong> {{employeeName}}</p>
      <p><strong>Type:</strong> {{leaveType}}</p>
      <p><strong>Dates:</strong> {{startDate}} - {{endDate}}</p>
      <p><strong>Days:</strong> {{totalDays}}</p>
      <p><strong>Reason:</strong> {{reason}}</p>
      <p><a href="{{actionUrl}}">Review Request</a></p>
    `,
    text: `
Leave Request Submitted

Employee: {{employeeName}}
Type: {{leaveType}}
Dates: {{startDate}} - {{endDate}}
Days: {{totalDays}}
Reason: {{reason}}

Review at: {{actionUrl}}
    `,
  },

  // Approval notification
  approval_required: {
    subject: "Approval Required: {{requestType}}",
    html: `
      <h1>Approval Required</h1>
      <p>A {{requestType}} from {{requesterName}} requires your approval.</p>
      <p><strong>Details:</strong> {{details}}</p>
      <p><a href="{{actionUrl}}">Review and Approve</a></p>
    `,
    text: `
Approval Required

A {{requestType}} from {{requesterName}} requires your approval.

Details: {{details}}

Review at: {{actionUrl}}
    `,
  },

  // Generic notification
  notification: {
    subject: "{{subject}}",
    html: `
      <h1>{{title}}</h1>
      <p>{{message}}</p>
      {{#if actionUrl}}
      <p><a href="{{actionUrl}}">{{actionText}}</a></p>
      {{/if}}
    `,
    text: `
{{title}}

{{message}}

{{#if actionUrl}}
{{actionText}}: {{actionUrl}}
{{/if}}
    `,
  },
};

/**
 * Simple template renderer (replace with Handlebars in production)
 */
function renderTemplate(
  templateName: string,
  data: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const template = EMAIL_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const render = (str: string): string => {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(data[key] ?? "");
    });
  };

  return {
    subject: render(template.subject),
    html: render(template.html),
    text: render(template.text),
  };
}

// =============================================================================
// Email Notification Processor
// =============================================================================

/**
 * Process email notification job
 */
async function processEmailNotification(
  payload: JobPayload<EmailNotificationPayload>,
  context: JobContext
): Promise<void> {
  const { log, db } = context;
  const email = payload.data;

  log.info(`Sending email to ${email.to}`, { subject: email.subject });

  // Log email as queued in the email delivery log
  let emailLogId: string | null = null;
  if (payload.tenantId) {
    emailLogId = await logEmailDelivery(db, "queued", {
      tenantId: payload.tenantId,
      toAddress: email.to,
      subject: email.subject,
      templateName: email.template,
    });
  }

  try {
    // Render template if specified
    let subject = email.subject;
    let htmlBody = email.htmlBody;
    let textBody = email.textBody;

    if (email.template && email.templateData) {
      const rendered = renderTemplate(email.template, email.templateData);
      subject = rendered.subject;
      htmlBody = rendered.html;
      textBody = rendered.text;
    }

    // Get mailer and send
    const mailer = getMailer();
    const result = await mailer.send({
      ...email,
      subject,
      htmlBody,
      textBody,
    });

    log.info(`Email sent successfully`, { messageId: result.messageId });

    // Update email delivery log to 'sent' status
    if (emailLogId && payload.tenantId) {
      await updateEmailDeliveryStatus(db, emailLogId, "sent", {
        messageId: result.messageId,
      });
    }

    // Record delivery in database if we have tenant context
    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: payload.userId,
        channel: "email",
        recipient: email.to,
        subject,
        messageId: result.messageId,
        success: true,
      });
    }
  } catch (error) {
    log.error("Failed to send email", error);

    // Update email delivery log to 'failed' status
    if (emailLogId && payload.tenantId) {
      await updateEmailDeliveryStatus(db, emailLogId, "failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    // Record failure
    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: payload.userId,
        channel: "email",
        recipient: email.to,
        subject: email.subject,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
}

// =============================================================================
// In-App Notification Processor
// =============================================================================

/**
 * Process in-app notification job
 */
async function processInAppNotification(
  payload: JobPayload<InAppNotificationPayload>,
  context: JobContext
): Promise<void> {
  const { log, db, cache } = context;
  const notification = payload.data;

  log.info(`Creating in-app notification for user ${notification.userId}`);

  try {
    // Insert notification into database
    const result = await db.withSystemContext(async (tx) => {
      // Check if notifications table exists and insert
      return await tx<{ id: string }[]>`
        INSERT INTO app.notifications (
          tenant_id,
          user_id,
          title,
          message,
          type,
          action_url,
          action_text,
          icon,
          data,
          expires_at,
          created_at
        )
        VALUES (
          ${payload.tenantId}::uuid,
          ${notification.userId}::uuid,
          ${notification.title},
          ${notification.message},
          ${notification.type},
          ${notification.actionUrl || null},
          ${notification.actionText || null},
          ${notification.icon || null},
          ${JSON.stringify(notification.data || {})}::jsonb,
          ${notification.expiresAt ? new Date(notification.expiresAt) : null},
          now()
        )
        RETURNING id
      `;
    });

    const notificationId = result[0]?.id;
    log.info(`In-app notification created`, { notificationId });

    // Invalidate user's notification cache
    if (payload.tenantId) {
      await cache.del(`notifications:${payload.tenantId}:${notification.userId}:unread`);
    }

    // Record delivery
    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: notification.userId,
        channel: "in_app",
        recipient: notification.userId,
        subject: notification.title,
        messageId: notificationId,
        success: true,
      });
    }
  } catch (error) {
    log.error("Failed to create in-app notification", error);

    // Record failure
    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: notification.userId,
        channel: "in_app",
        recipient: notification.userId,
        subject: notification.title,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
}

// =============================================================================
// Push Notification Processor
// =============================================================================

// ---------------------------------------------------------------------------
// Web Push (VAPID) Support
// ---------------------------------------------------------------------------

/** Lazy-loaded web-push module instance */
let webPushModule: typeof import("web-push") | null = null;
/** Whether VAPID keys have been set on the web-push module */
let vapidConfigured = false;

/**
 * Get the web-push module, configured with VAPID keys.
 * Returns null if VAPID environment variables are not set.
 */
async function getWebPush(): Promise<typeof import("web-push") | null> {
  if (webPushModule && vapidConfigured) return webPushModule;

  const vapidPublicKey = process.env["VAPID_PUBLIC_KEY"];
  const vapidPrivateKey = process.env["VAPID_PRIVATE_KEY"];
  const vapidSubject = process.env["VAPID_SUBJECT"] || "mailto:noreply@staffora.co.uk";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return null;
  }

  if (!webPushModule) {
    webPushModule = await import("web-push");
  }

  if (!vapidConfigured) {
    webPushModule.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
  }

  return webPushModule;
}

/**
 * Send Web Push notifications to all VAPID subscriptions for a user.
 * Automatically cleans up expired/invalid subscriptions (HTTP 410 Gone).
 */
async function sendWebPushNotifications(
  db: import("../plugins/db").DatabaseClient,
  userId: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: number;
    data?: Record<string, unknown>;
    clickAction?: string;
    ttl?: number;
  },
  log: import("./base").JobLogger
): Promise<{ sent: number; failed: number; cleaned: number }> {
  const wp = await getWebPush();
  if (!wp) {
    log.debug("Web Push (VAPID) not configured, skipping");
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  // Fetch all Web Push subscriptions for this user (system context to bypass RLS)
  const subscriptions = await db.withSystemContext(async (tx) => {
    return await tx<Array<{ id: string; endpoint: string; authKey: string; p256dhKey: string }>>`
      SELECT id, endpoint, auth_key, p256dh_key
      FROM app.push_subscriptions
      WHERE user_id = ${userId}::uuid
    `;
  });

  if (subscriptions.length === 0) {
    log.debug(`No Web Push subscriptions found for user ${userId}`);
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  log.info(`Sending Web Push to ${subscriptions.length} subscription(s) for user ${userId}`);

  const pushPayload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon,
    badge: notification.badge,
    data: notification.data,
    url: notification.clickAction,
  });

  const options: import("web-push").RequestOptions = {
    TTL: notification.ttl ?? 86400, // Default 24 hours
    urgency: "normal",
  };

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  // Send to each subscription individually to handle per-subscription errors
  const sendPromises = subscriptions.map(async (sub) => {
    const pushSubscription: import("web-push").PushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        auth: sub.authKey,
        p256dh: sub.p256dhKey,
      },
    };

    try {
      await wp.sendNotification(pushSubscription, pushPayload, options);
      sent++;
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;

      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired or not found — schedule cleanup
        expiredEndpoints.push(sub.endpoint);
        log.info(`Web Push subscription expired (${statusCode}), scheduling cleanup`, {
          endpoint: sub.endpoint.substring(0, 80),
        });
      } else {
        failed++;
        log.warn(`Web Push send failed`, {
          statusCode,
          endpoint: sub.endpoint.substring(0, 80),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  await Promise.allSettled(sendPromises);

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await db.withSystemContext(async (tx) => {
      await tx`
        DELETE FROM app.push_subscriptions
        WHERE endpoint = ANY(${expiredEndpoints})
      `;
    });
    log.info(`Cleaned up ${expiredEndpoints.length} expired Web Push subscription(s)`);
  }

  return { sent, failed, cleaned: expiredEndpoints.length };
}

// ---------------------------------------------------------------------------
// Firebase Admin (FCM) Support
// ---------------------------------------------------------------------------

// Firebase Admin instance (lazy loaded)
let firebaseApp: import("firebase-admin").app.App | null = null;

async function getFirebaseApp(): Promise<import("firebase-admin").app.App | null> {
  if (firebaseApp) return firebaseApp;

  const serviceAccountPath = process.env["FIREBASE_SERVICE_ACCOUNT_PATH"];
  const serviceAccountJson = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];

  if (!serviceAccountPath && !serviceAccountJson) {
    return null;
  }

  const admin = await import("firebase-admin");

  const credential = serviceAccountJson
    ? admin.credential.cert(JSON.parse(serviceAccountJson))
    : admin.credential.cert(serviceAccountPath!);

  firebaseApp = admin.initializeApp({
    credential,
  });

  return firebaseApp;
}

/**
 * Send Firebase Cloud Messaging (FCM) push notifications.
 */
async function sendFcmNotifications(
  db: import("../plugins/db").DatabaseClient,
  userId: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: number;
    sound?: string;
    data?: Record<string, unknown>;
    clickAction?: string;
    ttl?: number;
  },
  log: import("./base").JobLogger
): Promise<{ sent: number; failed: number; cleaned: number }> {
  // Get user's push tokens from database (FCM tokens)
  const tokens = await db.withSystemContext(async (tx) => {
    return await tx<Array<{ token: string; platform: string }>>`
      SELECT token, platform
      FROM app.push_tokens
      WHERE user_id = ${userId}::uuid
        AND enabled = true
        AND (expires_at IS NULL OR expires_at > now())
    `;
  });

  const fcmTokens = tokens.filter(
    (t) => t.platform === "fcm" || t.platform === "android" || t.platform === "web"
  );

  if (fcmTokens.length === 0) {
    log.debug(`No FCM tokens found for user ${userId}`);
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  // Get Firebase app
  const app = await getFirebaseApp();

  if (!app) {
    log.debug("Firebase not configured, skipping FCM push notification");
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  const admin = await import("firebase-admin");
  const messaging = admin.messaging(app);

  const message: import("firebase-admin/messaging").MulticastMessage = {
    tokens: fcmTokens.map((t) => t.token),
    notification: {
      title: notification.title,
      body: notification.body,
      imageUrl: notification.icon,
    },
    data: notification.data
      ? Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)]))
      : undefined,
    android: {
      priority: "high",
      notification: {
        sound: notification.sound || "default",
        clickAction: notification.clickAction,
      },
      ttl: (notification.ttl || 86400) * 1000,
    },
    webpush: {
      notification: {
        icon: notification.icon,
        badge: notification.badge?.toString(),
      },
      fcmOptions: {
        link: notification.clickAction,
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  log.info(`FCM sent: ${response.successCount} success, ${response.failureCount} failed`);

  // Track invalid tokens for cleanup
  const invalidTokens: string[] = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
      invalidTokens.push(fcmTokens[idx]!.token);
    }
  });

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    await db.withSystemContext(async (tx) => {
      await tx`
        UPDATE app.push_tokens
        SET enabled = false, updated_at = now()
        WHERE token = ANY(${invalidTokens})
      `;
    });
    log.info(`Disabled ${invalidTokens.length} invalid FCM token(s)`);
  }

  return {
    sent: response.successCount,
    failed: response.failureCount - invalidTokens.length,
    cleaned: invalidTokens.length,
  };
}

// ---------------------------------------------------------------------------
// Unified Push Notification Processor
// ---------------------------------------------------------------------------

/**
 * Process push notification job.
 *
 * Sends to both channels in parallel:
 * 1. Web Push (VAPID) subscriptions from push_subscriptions table
 * 2. Firebase Cloud Messaging (FCM) tokens from push_tokens table
 *
 * Either or both channels may be configured. If neither is configured,
 * the job completes with a warning.
 */
async function processPushNotification(
  payload: JobPayload<PushNotificationPayload>,
  context: JobContext
): Promise<void> {
  const { log, db } = context;
  const push = payload.data;

  log.info(`Sending push notification to user ${push.userId}`);

  try {
    // Send via both channels in parallel
    const [webPushResult, fcmResult] = await Promise.all([
      sendWebPushNotifications(
        db,
        push.userId,
        {
          title: push.title,
          body: push.body,
          icon: push.icon,
          badge: push.badge,
          data: push.data,
          clickAction: push.clickAction,
          ttl: push.ttl,
        },
        log
      ),
      sendFcmNotifications(
        db,
        push.userId,
        {
          title: push.title,
          body: push.body,
          icon: push.icon,
          badge: push.badge,
          sound: push.sound,
          data: push.data,
          clickAction: push.clickAction,
          ttl: push.ttl,
        },
        log
      ),
    ]);

    const totalSent = webPushResult.sent + fcmResult.sent;
    const totalFailed = webPushResult.failed + fcmResult.failed;
    const totalCleaned = webPushResult.cleaned + fcmResult.cleaned;

    if (totalSent === 0 && totalFailed === 0 && totalCleaned === 0) {
      log.warn(
        `No push channels available for user ${push.userId} (no subscriptions/tokens, or services not configured)`
      );
    } else {
      log.info(`Push notification complete`, {
        webPush: webPushResult,
        fcm: fcmResult,
        totalSent,
      });
    }

    // Record delivery
    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: push.userId,
        channel: "push",
        recipient: push.userId,
        subject: push.title,
        success: totalSent > 0,
        metadata: {
          webPush: webPushResult,
          fcm: fcmResult,
          totalSent,
          totalFailed,
        },
      });
    }
  } catch (error) {
    log.error("Failed to send push notification", error);

    if (payload.tenantId) {
      await recordNotificationDelivery(db, {
        tenantId: payload.tenantId,
        userId: push.userId,
        channel: "push",
        recipient: push.userId,
        subject: push.title,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
}

// =============================================================================
// Delivery Recording
// =============================================================================

/**
 * Record notification delivery attempt
 */
async function recordNotificationDelivery(
  db: import("../plugins/db").DatabaseClient,
  delivery: {
    tenantId: string;
    userId?: string;
    channel: NotificationChannel;
    recipient: string;
    subject: string;
    messageId?: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.withSystemContext(async (tx) => {
      await tx`
        INSERT INTO app.notification_deliveries (
          tenant_id,
          user_id,
          channel,
          recipient,
          subject,
          message_id,
          success,
          error,
          metadata,
          delivered_at
        )
        VALUES (
          ${delivery.tenantId}::uuid,
          ${delivery.userId || null}::uuid,
          ${delivery.channel},
          ${delivery.recipient},
          ${delivery.subject},
          ${delivery.messageId || null},
          ${delivery.success},
          ${delivery.error || null},
          ${JSON.stringify(delivery.metadata || {})}::jsonb,
          now()
        )
      `;
    });
  } catch (error) {
    // Log but don't fail - delivery recording is not critical
    console.error("[NotificationWorker] Failed to record delivery:", error);
  }
}

// =============================================================================
// Email Delivery Log Recording
// =============================================================================

/**
 * Log an email delivery event to the email_delivery_log table.
 * Returns the created log entry ID (or null if logging fails).
 */
async function logEmailDelivery(
  db: import("../plugins/db").DatabaseClient,
  status: "queued" | "sent" | "delivered" | "bounced" | "failed",
  data: {
    tenantId: string;
    toAddress: string;
    subject: string;
    templateName?: string;
    messageId?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  try {
    const rows = await db.withSystemContext(async (tx) => {
      return tx<{ id: string }[]>`
        INSERT INTO app.email_delivery_log (
          tenant_id,
          to_address,
          subject,
          template_name,
          status,
          message_id,
          sent_at,
          error_message,
          metadata
        )
        VALUES (
          ${data.tenantId}::uuid,
          ${data.toAddress},
          ${data.subject},
          ${data.templateName ?? null},
          ${status}::app.email_delivery_status,
          ${data.messageId ?? null},
          ${status === "sent" ? new Date() : null},
          ${data.errorMessage ?? null},
          ${JSON.stringify(data.metadata ?? {})}::jsonb
        )
        RETURNING id
      `;
    });
    return rows[0]?.id ?? null;
  } catch (error) {
    // Log but don't fail - delivery logging is not critical
    console.error("[NotificationWorker] Failed to log email delivery:", error);
    return null;
  }
}

/**
 * Update the status of an existing email delivery log entry.
 */
async function updateEmailDeliveryStatus(
  db: import("../plugins/db").DatabaseClient,
  id: string,
  status: "sent" | "delivered" | "bounced" | "failed",
  data?: {
    messageId?: string;
    errorMessage?: string;
    bounceType?: string;
    bounceReason?: string;
  }
): Promise<void> {
  try {
    await db.withSystemContext(async (tx) => {
      if (status === "sent") {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'sent'::app.email_delivery_status,
              message_id = COALESCE(${data?.messageId ?? null}, message_id),
              sent_at = now(),
              updated_at = now()
          WHERE id = ${id}::uuid
        `;
      } else if (status === "delivered") {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'delivered'::app.email_delivery_status,
              delivered_at = now(),
              updated_at = now()
          WHERE id = ${id}::uuid
        `;
      } else if (status === "bounced") {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'bounced'::app.email_delivery_status,
              bounced_at = now(),
              bounce_type = ${data?.bounceType ?? null},
              bounce_reason = ${data?.bounceReason ?? null},
              updated_at = now()
          WHERE id = ${id}::uuid
        `;
      } else if (status === "failed") {
        await tx`
          UPDATE app.email_delivery_log
          SET status = 'failed'::app.email_delivery_status,
              error_message = ${data?.errorMessage ?? null},
              retry_count = retry_count + 1,
              updated_at = now()
          WHERE id = ${id}::uuid
        `;
      }
    });
  } catch (error) {
    // Log but don't fail - status update is not critical
    console.error("[NotificationWorker] Failed to update email delivery status:", error);
  }
}

// =============================================================================
// Processor Registrations
// =============================================================================

/**
 * Email notification processor registration
 */
export const emailProcessor: ProcessorRegistration<EmailNotificationPayload> = {
  type: JobTypes.SEND_EMAIL,
  processor: processEmailNotification,
  timeoutMs: 60000, // 1 minute
  retry: true,
};

/**
 * In-app notification processor registration
 */
export const inAppProcessor: ProcessorRegistration<InAppNotificationPayload> = {
  type: JobTypes.SEND_IN_APP,
  processor: processInAppNotification,
  timeoutMs: 30000, // 30 seconds
  retry: true,
};

/**
 * Push notification processor registration
 */
export const pushProcessor: ProcessorRegistration<PushNotificationPayload> = {
  type: JobTypes.SEND_PUSH,
  processor: processPushNotification,
  timeoutMs: 60000, // 1 minute
  retry: true,
};

/**
 * All notification processors
 */
export const notificationProcessors: ProcessorRegistration[] = [
  emailProcessor,
  inAppProcessor,
  pushProcessor,
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an email notification job
 */
export function createEmailJob(
  email: EmailNotificationPayload,
  options?: {
    tenantId?: string;
    userId?: string;
    priority?: NotificationPriority;
  }
): JobPayload<EmailNotificationPayload> {
  return {
    id: crypto.randomUUID(),
    type: JobTypes.SEND_EMAIL,
    tenantId: options?.tenantId,
    userId: options?.userId,
    data: email,
    metadata: {
      createdAt: new Date().toISOString(),
      priority: options?.priority === "urgent" ? 0 : options?.priority === "high" ? 1 : 2,
    },
  };
}

/**
 * Create an in-app notification job
 */
export function createInAppJob(
  notification: InAppNotificationPayload,
  options?: {
    tenantId?: string;
  }
): JobPayload<InAppNotificationPayload> {
  return {
    id: crypto.randomUUID(),
    type: JobTypes.SEND_IN_APP,
    tenantId: options?.tenantId,
    userId: notification.userId,
    data: notification,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a push notification job
 */
export function createPushJob(
  push: PushNotificationPayload,
  options?: {
    tenantId?: string;
  }
): JobPayload<PushNotificationPayload> {
  return {
    id: crypto.randomUUID(),
    type: JobTypes.SEND_PUSH,
    tenantId: options?.tenantId,
    userId: push.userId,
    data: push,
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };
}

export default notificationProcessors;
