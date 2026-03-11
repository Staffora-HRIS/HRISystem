/**
 * Jobs Module Index
 *
 * Exports all job processors and worker infrastructure
 * for the Staffora background worker system.
 */

// =============================================================================
// Base Infrastructure
// =============================================================================

export {
  // Configuration
  loadWorkerConfig,
  type WorkerConfig,

  // Types
  type JobPayload,
  type JobContext,
  type JobLogger,
  type JobProcessor,
  type ProcessorRegistration,
  type WorkerHealth,

  // Base Worker
  BaseWorker,

  // Stream Keys
  StreamKeys,

  // Job Types
  JobTypes,
  type JobType,

  // Utilities
  createJobPayload,
  sleep,
} from "./base";

// =============================================================================
// Outbox Processor
// =============================================================================

export {
  outboxProcessor,
  startOutboxPolling,
  getOutboxStats,
  writeOutboxEvent,
  type OutboxEvent,
  type ProcessOutboxPayload,
  type DomainEvent,
} from "./outbox-processor";

// =============================================================================
// Notification Worker
// =============================================================================

export {
  // Processors
  emailProcessor,
  inAppProcessor,
  pushProcessor,
  notificationProcessors,

  // Job creators
  createEmailJob,
  createInAppJob,
  createPushJob,

  // Types
  type NotificationChannel,
  type NotificationPriority,
  type EmailNotificationPayload,
  type InAppNotificationPayload,
  type PushNotificationPayload,
  type NotificationPayload,
  type NotificationResult,

  // Mailer
  type Mailer,
  ConsoleMailer,
  SmtpMailer,
} from "./notification-worker";

// =============================================================================
// Export Worker
// =============================================================================

export {
  // Processors
  csvExportProcessor,
  excelExportProcessor,
  exportProcessors,

  // Storage
  type ExportStorage,
  LocalStorage,
  S3Storage,

  // Database operations
  createExportRecord,
  cleanupExpiredExports,

  // Types
  type ExportFormat,
  type ExportColumn,
  type ExportQuery,
  type CsvExportPayload,
  type ExcelExportPayload,
  type ExportResult,
  type ExportStatus,
  type ExportRecord,
} from "./export-worker";

// =============================================================================
// PDF Worker
// =============================================================================

export {
  // Processors
  certificateProcessor,
  employmentLetterProcessor,
  caseBundleProcessor,
  pdfProcessors,

  // PDF Generator
  type PdfGenerator,
  HtmlPdfGenerator,

  // Storage
  type DocumentStorage,
  LocalDocumentStorage,

  // Types
  type PdfDocumentType,
  type BasePdfPayload,
  type CertificatePayload,
  type EmploymentLetterPayload,
  type CaseBundlePayload,
  type PdfPayload,
  type PdfResult,
} from "./pdf-worker";

// =============================================================================
// Analytics Worker
// =============================================================================

export {
  // Processors
  analyticsAggregateProcessor,
  analyticsMetricsProcessor,
  analyticsProcessors,

  // Runner
  runScheduledAnalytics,

  // Types
  type MetricType,
  type TimeGranularity,
  type Dimension,
  type AnalyticsAggregatePayload,
  type AnalyticsMetricsPayload,
  type MetricResult,
  type AggregatedMetric,
} from "./analytics-worker";

// =============================================================================
// All Processors
// =============================================================================

import { outboxProcessor } from "./outbox-processor";
import { notificationProcessors } from "./notification-worker";
import { exportProcessors } from "./export-worker";
import { pdfProcessors } from "./pdf-worker";
import { analyticsProcessors } from "./analytics-worker";
import type { ProcessorRegistration } from "./base";

/**
 * All available job processors
 */
export const allProcessors: ProcessorRegistration[] = [
  outboxProcessor,
  ...notificationProcessors,
  ...exportProcessors,
  ...pdfProcessors,
  ...analyticsProcessors,
];

/**
 * Get processors by category
 */
export const processorsByCategory = {
  outbox: [outboxProcessor],
  notifications: notificationProcessors,
  exports: exportProcessors,
  pdf: pdfProcessors,
  analytics: analyticsProcessors,
} as const;
