/**
 * Worker Base Infrastructure
 *
 * Provides the foundation for background job processing using Redis Streams.
 * Features:
 * - Consumer group management
 * - Job registration and routing
 * - Error handling with dead letter queue
 * - Graceful shutdown support
 * - Health check capabilities
 * - Backpressure handling
 */

import Redis from "ioredis";
import { retry } from "@staffora/shared/utils";
import { getDbClient, closeDbClient, type DatabaseClient } from "../plugins/db";
import { getCacheClient, closeCacheClient, type CacheClient } from "../plugins/cache";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Worker configuration from environment
 */
export interface WorkerConfig {
  /** Redis connection URL */
  redisUrl: string;
  /** Worker consumer group name */
  consumerGroup: string;
  /** Unique consumer ID within the group */
  consumerId: string;
  /** Maximum concurrent jobs */
  concurrency: number;
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Block timeout for XREADGROUP in milliseconds */
  blockTimeoutMs: number;
  /** Maximum retries before moving to DLQ */
  maxRetries: number;
  /** Whether to process pending messages on startup */
  processPending: boolean;
  /** Claim timeout for pending messages (ms) */
  claimTimeoutMs: number;
}

/**
 * Load worker configuration from environment
 */
export function loadWorkerConfig(): WorkerConfig {
  const workerId = process.env["WORKER_ID"] || `worker-${process.pid}`;
  return {
    redisUrl: process.env["REDIS_URL"] || "redis://localhost:6379",
    consumerGroup: process.env["WORKER_GROUP"] || "staffora-workers",
    consumerId: workerId,
    concurrency: Number(process.env["WORKER_CONCURRENCY"]) || 5,
    pollIntervalMs: Number(process.env["WORKER_POLL_INTERVAL"]) || 1000,
    blockTimeoutMs: Number(process.env["WORKER_BLOCK_TIMEOUT"]) || 5000,
    maxRetries: Number(process.env["WORKER_MAX_RETRIES"]) || 10,
    processPending: process.env["WORKER_PROCESS_PENDING"] !== "false",
    claimTimeoutMs: Number(process.env["WORKER_CLAIM_TIMEOUT"]) || 60000,
  };
}

// =============================================================================
// Types
// =============================================================================

/**
 * Job payload structure
 */
export interface JobPayload<T = unknown> {
  /** Unique job ID */
  id: string;
  /** Job type (for routing to processor) */
  type: string;
  /** Tenant context */
  tenantId?: string;
  /** User who triggered the job */
  userId?: string;
  /** Job-specific data */
  data: T;
  /** Job metadata */
  metadata: {
    /** When the job was created */
    createdAt: string;
    /** Correlation ID for tracing */
    correlationId?: string;
    /** Request ID that created the job */
    requestId?: string;
    /** Priority (0 = highest) */
    priority?: number;
    /** Schedule time (ISO string) */
    scheduledAt?: string;
  };
}

/**
 * Job context provided to processors
 */
export interface JobContext {
  /** Database client */
  db: DatabaseClient;
  /** Cache client */
  cache: CacheClient;
  /** Redis client for publishing events */
  redis: Redis;
  /** Logger scoped to this job */
  log: JobLogger;
  /** Job metadata */
  jobId: string;
  /** Stream message ID */
  messageId: string;
  /** Attempt number (1-based) */
  attempt: number;
}

/**
 * Job logger interface
 */
export interface JobLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown> = (
  payload: JobPayload<T>,
  context: JobContext
) => Promise<void>;

/**
 * Job processor registration
 */
export interface ProcessorRegistration<T = unknown> {
  /** Job type this processor handles */
  type: string;
  /** The processor function */
  processor: JobProcessor<T>;
  /** Optional timeout override (ms) */
  timeoutMs?: number;
  /** Whether to retry on failure */
  retry?: boolean;
}

/**
 * Stream message from Redis
 */
interface StreamMessage {
  id: string;
  payload: string;
  attempt: string;
}

/**
 * Worker health status
 */
export interface WorkerHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  activeJobs: number;
  processedJobs: number;
  failedJobs: number;
  redis: "up" | "down";
  database: "up" | "down";
  lastPollAt: Date | null;
}

// =============================================================================
// Job Logger Implementation
// =============================================================================

/**
 * Create a logger scoped to a specific job
 */
function createJobLogger(jobId: string, jobType: string): JobLogger {
  const prefix = `[Job:${jobType}:${jobId.substring(0, 8)}]`;
  const timestamp = () => new Date().toISOString();

  return {
    info(message: string, data?: Record<string, unknown>) {
      console.log(`${timestamp()} ${prefix} INFO: ${message}`, data ? JSON.stringify(data) : "");
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(`${timestamp()} ${prefix} WARN: ${message}`, data ? JSON.stringify(data) : "");
    },
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>) {
      const errorInfo = {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        ...(process.env["NODE_ENV"] !== "production" && error instanceof Error ? { stack: error.stack } : {}),
      };
      console.error(`${timestamp()} ${prefix} ERROR: ${message}`, errorInfo, data ? JSON.stringify(data) : "");
    },
    debug(message: string, data?: Record<string, unknown>) {
      if (process.env["NODE_ENV"] !== "production") {
        console.debug(`${timestamp()} ${prefix} DEBUG: ${message}`, data ? JSON.stringify(data) : "");
      }
    },
  };
}

// =============================================================================
// Base Worker Class
// =============================================================================

/**
 * Base worker class for processing jobs from Redis Streams
 */
export class BaseWorker {
  protected config: WorkerConfig;
  protected redis: Redis;
  protected db: DatabaseClient;
  protected cache: CacheClient;
  protected processors: Map<string, ProcessorRegistration> = new Map();
  protected isShuttingDown = false;
  protected activeJobs = 0;
  protected processedJobs = 0;
  protected failedJobs = 0;
  protected startTime: Date;
  protected lastPollAt: Date | null = null;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...loadWorkerConfig(), ...config };
    this.startTime = new Date();

    // Initialize Redis client for streams
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    // Initialize database and cache clients
    this.db = getDbClient();
    this.cache = getCacheClient();
  }

  // ===========================================================================
  // Processor Registration
  // ===========================================================================

  /**
   * Register a job processor
   */
  register<T = unknown>(registration: ProcessorRegistration<T>): this {
    this.processors.set(registration.type, registration as ProcessorRegistration);
    console.log(`[Worker] Registered processor: ${registration.type}`);
    return this;
  }

  /**
   * Register multiple processors
   */
  registerAll(registrations: ProcessorRegistration[]): this {
    for (const registration of registrations) {
      this.register(registration);
    }
    return this;
  }

  // ===========================================================================
  // Stream Management
  // ===========================================================================

  /**
   * Ensure consumer group exists for a stream
   */
  async ensureConsumerGroup(streamKey: string): Promise<void> {
    try {
      await this.redis.xgroup(
        "CREATE",
        streamKey,
        this.config.consumerGroup,
        "$",
        "MKSTREAM"
      );
      console.log(`[Worker] Created consumer group ${this.config.consumerGroup} for ${streamKey}`);
    } catch (error) {
      // Group already exists - this is fine
      if (error instanceof Error && error.message.includes("BUSYGROUP")) {
        console.log(`[Worker] Consumer group ${this.config.consumerGroup} already exists for ${streamKey}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Publish a job to a stream
   */
  async publishJob<T>(
    streamKey: string,
    job: Omit<JobPayload<T>, "id" | "metadata"> & { metadata?: Partial<JobPayload<T>["metadata"]> }
  ): Promise<string> {
    const jobId = crypto.randomUUID();
    const payload: JobPayload<T> = {
      id: jobId,
      type: job.type,
      tenantId: job.tenantId,
      userId: job.userId,
      data: job.data,
      metadata: {
        createdAt: new Date().toISOString(),
        ...job.metadata,
      },
    };

    const messageId = await this.redis.xadd(
      streamKey,
      "*",
      "payload",
      JSON.stringify(payload),
      "attempt",
      "1"
    );

    console.log(`[Worker] Published job ${jobId} to ${streamKey} (message: ${messageId})`);
    return jobId;
  }

  /**
   * Move a job to the dead letter queue
   */
  async moveToDeadLetter(
    streamKey: string,
    messageId: string,
    payload: JobPayload,
    error: Error
  ): Promise<void> {
    const dlqKey = `${streamKey}:dlq`;

    await this.redis.xadd(
      dlqKey,
      "*",
      "payload",
      JSON.stringify(payload),
      "originalMessageId",
      messageId,
      "error",
      error.message,
      "failedAt",
      new Date().toISOString()
    );
    // Trim DLQ to prevent unbounded growth (approximate, keeps ~10k entries)
    await this.redis.xtrim(dlqKey, "MAXLEN", "~", 10000);

    console.log(`[Worker] Moved job ${payload.id} to DLQ: ${dlqKey}`);
  }

  // ===========================================================================
  // Job Processing
  // ===========================================================================

  /**
   * Process a single job
   */
  protected async processJob(
    streamKey: string,
    messageId: string,
    message: StreamMessage
  ): Promise<void> {
    const payload: JobPayload = JSON.parse(message.payload);
    const attempt = parseInt(message.attempt, 10) || 1;
    const registration = this.processors.get(payload.type);

    if (!registration) {
      console.error(`[Worker] No processor for job type: ${payload.type}`);
      await this.redis.xack(streamKey, this.config.consumerGroup, messageId);
      return;
    }

    const log = createJobLogger(payload.id, payload.type);
    const context: JobContext = {
      db: this.db,
      cache: this.cache,
      redis: this.redis,
      log,
      jobId: payload.id,
      messageId,
      attempt,
    };

    this.activeJobs++;
    const startTime = Date.now();

    try {
      log.info(`Processing job (attempt ${attempt})`);

      // Apply timeout if configured
      const timeoutMs = registration.timeoutMs || 300000; // 5 min default
      await Promise.race([
        registration.processor(payload, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Job timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      // Acknowledge success
      await this.redis.xack(streamKey, this.config.consumerGroup, messageId);
      this.processedJobs++;

      // Trim stream periodically (every 100 jobs) instead of on every job
      if (this.processedJobs % 100 === 0) {
        await this.redis.xtrim(streamKey, "MAXLEN", "~", 100000);
      }

      const duration = Date.now() - startTime;
      log.info(`Job completed successfully`, { durationMs: duration });
    } catch (error) {
      this.failedJobs++;
      const duration = Date.now() - startTime;
      log.error(`Job failed`, error, { durationMs: duration, attempt });

      const shouldRetry = registration.retry !== false && attempt < this.config.maxRetries;

      if (shouldRetry) {
        // Re-add to stream with incremented attempt
        await this.redis.xadd(
          streamKey,
          "*",
          "payload",
          JSON.stringify(payload),
          "attempt",
          String(attempt + 1)
        );
        log.info(`Scheduled retry (attempt ${attempt + 1})`);
      } else {
        // Move to dead letter queue
        await this.moveToDeadLetter(
          streamKey,
          messageId,
          payload,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Always acknowledge to prevent infinite loop
      await this.redis.xack(streamKey, this.config.consumerGroup, messageId);
    } finally {
      this.activeJobs--;
    }
  }

  /**
   * Poll for and process messages from a stream
   */
  protected async pollStream(streamKey: string): Promise<number> {
    if (this.isShuttingDown) return 0;
    if (this.activeJobs >= this.config.concurrency) return 0;

    this.lastPollAt = new Date();
    const availableSlots = this.config.concurrency - this.activeJobs;

    try {
      // Read new messages
      const results = await this.redis.xreadgroup(
        "GROUP",
        this.config.consumerGroup,
        this.config.consumerId,
        "COUNT",
        availableSlots,
        "BLOCK",
        this.config.blockTimeoutMs,
        "STREAMS",
        streamKey,
        ">"
      ) as Array<[string, Array<[string, string[]]>]> | null;

      if (!results || results.length === 0) {
        return 0;
      }

      let processed = 0;
      for (const [, messages] of results) {
        for (const [messageId, fields] of messages) {
          // Convert fields array to object
          const message: StreamMessage = { id: messageId, payload: "", attempt: "1" };
          for (let i = 0; i < fields.length; i += 2) {
            const key = fields[i] as keyof StreamMessage;
            message[key] = fields[i + 1] as string;
          }

          // Process asynchronously to allow concurrent processing
          this.processJob(streamKey, messageId, message).catch((err) => {
            console.error(`[Worker] Unexpected error processing message ${messageId}:`, err);
          });
          processed++;
        }
      }

      return processed;
    } catch (error) {
      console.error(`[Worker] Error polling stream ${streamKey}:`, error);
      return 0;
    }
  }

  /**
   * Claim and process pending (abandoned) messages
   */
  protected async processPendingMessages(streamKey: string): Promise<number> {
    if (this.isShuttingDown) return 0;

    try {
      // Get pending messages older than claim timeout
      const pending = await this.redis.xpending(
        streamKey,
        this.config.consumerGroup,
        "-",
        "+",
        "10"
      ) as Array<[string, string, number, number]>;

      if (!pending || pending.length === 0) return 0;

      let claimed = 0;
      for (const [messageId, , idleTime] of pending) {
        if (idleTime < this.config.claimTimeoutMs) continue;

        // Claim the message
        const claimResult = await this.redis.xclaim(
          streamKey,
          this.config.consumerGroup,
          this.config.consumerId,
          this.config.claimTimeoutMs,
          messageId
        ) as Array<[string, string[]]>;

        if (claimResult && claimResult.length > 0) {
          const [, fields] = claimResult[0] as [string, string[]];
          const message: StreamMessage = { id: messageId, payload: "", attempt: "1" };
          for (let i = 0; i < fields.length; i += 2) {
            const key = fields[i] as keyof StreamMessage;
            message[key] = fields[i + 1] as string;
          }

          await this.processJob(streamKey, messageId, message);
          claimed++;
        }
      }

      return claimed;
    } catch (error) {
      console.error(`[Worker] Error processing pending messages for ${streamKey}:`, error);
      return 0;
    }
  }

  // ===========================================================================
  // Lifecycle Management
  // ===========================================================================

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    console.log("[Worker] Initializing...");

    // Connect to Redis
    await this.redis.connect();
    console.log("[Worker] Connected to Redis");

    // Connect to cache
    await this.cache.connect();
    console.log("[Worker] Connected to cache");

    // Verify database connection with retry + exponential backoff
    await retry(
      async () => {
        const dbHealth = await this.db.healthCheck();
        if (dbHealth.status !== "up") {
          throw new Error("Database health check returned status: " + dbHealth.status);
        }
      },
      { maxRetries: 4, baseDelay: 2000, maxDelay: 32000 }
    );
    console.log("[Worker] Database connection verified");
  }

  /**
   * Start the worker
   */
  async start(streams: string[]): Promise<void> {
    await this.initialize();

    // Ensure consumer groups exist
    for (const stream of streams) {
      await this.ensureConsumerGroup(stream);
    }

    console.log(`[Worker] Starting with concurrency=${this.config.concurrency}`);
    console.log(`[Worker] Listening on streams: ${streams.join(", ")}`);

    // Process pending messages first if configured
    if (this.config.processPending) {
      console.log("[Worker] Processing pending messages...");
      for (const stream of streams) {
        const claimed = await this.processPendingMessages(stream);
        if (claimed > 0) {
          console.log(`[Worker] Claimed ${claimed} pending messages from ${stream}`);
        }
      }
    }

    // Main processing loop
    while (!this.isShuttingDown) {
      let totalProcessed = 0;

      for (const stream of streams) {
        const processed = await this.pollStream(stream);
        totalProcessed += processed;
      }

      // If no messages were found, wait before polling again
      if (totalProcessed === 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) return;

    console.log(`[Worker] ${signal ? `Received ${signal}, ` : ""}initiating graceful shutdown...`);
    this.isShuttingDown = true;

    const shutdownTimeout = 30000;
    const startTime = Date.now();

    // Wait for active jobs to complete
    while (this.activeJobs > 0 && Date.now() - startTime < shutdownTimeout) {
      console.log(`[Worker] Waiting for ${this.activeJobs} active job(s)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (this.activeJobs > 0) {
      console.warn(`[Worker] Forcing shutdown with ${this.activeJobs} active job(s)`);
    }

    // Close connections
    await this.redis.quit();
    await closeDbClient();
    await closeCacheClient();

    console.log("[Worker] Shutdown complete");
    console.log(`[Worker] Stats: processed=${this.processedJobs}, failed=${this.failedJobs}`);
  }

  /**
   * Get worker health status
   */
  async getHealth(): Promise<WorkerHealth> {
    let redisStatus: "up" | "down" = "down";
    let dbStatus: "up" | "down" = "down";

    try {
      await this.redis.ping();
      redisStatus = "up";
    } catch {
      redisStatus = "down";
    }

    try {
      const dbHealth = await this.db.healthCheck();
      dbStatus = dbHealth.status;
    } catch {
      dbStatus = "down";
    }

    const status =
      redisStatus === "up" && dbStatus === "up"
        ? "healthy"
        : redisStatus === "down" || dbStatus === "down"
          ? "unhealthy"
          : "degraded";

    return {
      status,
      uptime: Date.now() - this.startTime.getTime(),
      activeJobs: this.activeJobs,
      processedJobs: this.processedJobs,
      failedJobs: this.failedJobs,
      redis: redisStatus,
      database: dbStatus,
      lastPollAt: this.lastPollAt,
    };
  }
}

// =============================================================================
// Stream Keys
// =============================================================================

/**
 * Standard stream keys for the Staffora platform
 */
export const StreamKeys = {
  /** Domain events from the outbox */
  DOMAIN_EVENTS: "staffora:events:domain",
  /** Notification jobs */
  NOTIFICATIONS: "staffora:jobs:notifications",
  /** Export jobs */
  EXPORTS: "staffora:jobs:exports",
  /** PDF generation jobs */
  PDF_GENERATION: "staffora:jobs:pdf",
  /** Analytics processing jobs */
  ANALYTICS: "staffora:jobs:analytics",
  /** General background jobs */
  BACKGROUND: "staffora:jobs:background",
} as const;

// =============================================================================
// Job Types
// =============================================================================

/**
 * Standard job types
 */
export const JobTypes = {
  // Domain Events
  PROCESS_OUTBOX: "outbox.process",

  // Notifications
  SEND_EMAIL: "notification.email",
  SEND_IN_APP: "notification.in_app",
  SEND_PUSH: "notification.push",

  // Exports
  EXPORT_CSV: "export.csv",
  EXPORT_EXCEL: "export.excel",

  // PDF Generation
  PDF_CERTIFICATE: "pdf.certificate",
  PDF_EMPLOYMENT_LETTER: "pdf.employment_letter",
  PDF_CASE_BUNDLE: "pdf.case_bundle",
  PDF_BULK_DOCUMENT_ITEM: "pdf.bulk_document_item",

  // Analytics
  ANALYTICS_AGGREGATE: "analytics.aggregate",
  ANALYTICS_METRICS: "analytics.metrics",

  // Scheduled Tasks
  CLEANUP_SESSIONS: "scheduled.cleanup_sessions",
  CLEANUP_OUTBOX: "scheduled.cleanup_outbox",
  SYNC_PERMISSIONS: "scheduled.sync_permissions",
} as const;

export type JobType = (typeof JobTypes)[keyof typeof JobTypes];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a job payload helper
 */
export function createJobPayload<T>(
  type: JobType,
  data: T,
  options?: {
    tenantId?: string;
    userId?: string;
    correlationId?: string;
    requestId?: string;
    priority?: number;
    scheduledAt?: Date;
  }
): Omit<JobPayload<T>, "id"> {
  return {
    type,
    tenantId: options?.tenantId,
    userId: options?.userId,
    data,
    metadata: {
      createdAt: new Date().toISOString(),
      correlationId: options?.correlationId,
      requestId: options?.requestId,
      priority: options?.priority,
      scheduledAt: options?.scheduledAt?.toISOString(),
    },
  };
}

/**
 * Sleep utility for workers
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
