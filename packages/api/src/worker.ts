/**
 * HRIS Platform Background Worker
 *
 * Main entry point for the background job processing system.
 * Processes jobs from Redis Streams including:
 * - Domain events (outbox pattern)
 * - Email notifications
 * - In-app notifications
 * - Report exports (CSV, Excel)
 * - PDF document generation
 * - Analytics aggregation
 *
 * Features:
 * - Consumer group-based scaling
 * - Graceful shutdown with job draining
 * - Dead letter queue for failed jobs
 * - Health check endpoint
 * - Metrics collection
 */

import { Elysia } from "elysia";
import {
  BaseWorker,
  StreamKeys,
  allProcessors,
  startOutboxPolling,
  loadWorkerConfig,
  type WorkerHealth,
} from "./jobs";
import { getDbClient } from "./plugins/db";
import { getCacheClient } from "./plugins/cache";

// =============================================================================
// Configuration
// =============================================================================

const config = {
  ...loadWorkerConfig(),
  nodeEnv: process.env["NODE_ENV"] || "development",
  healthPort: Number(process.env["WORKER_HEALTH_PORT"]) || 3001,
  enableOutboxPolling: process.env["ENABLE_OUTBOX_POLLING"] !== "false",
  outboxPollIntervalMs: Number(process.env["OUTBOX_POLL_INTERVAL"]) || 1000,
  outboxBatchSize: Number(process.env["OUTBOX_BATCH_SIZE"]) || 100,
};

// =============================================================================
// Worker Instance
// =============================================================================

/**
 * Create and configure the worker instance
 */
function createWorker(): BaseWorker {
  const worker = new BaseWorker({
    consumerGroup: config.consumerGroup,
    consumerId: config.consumerId,
    concurrency: config.concurrency,
    pollIntervalMs: config.pollIntervalMs,
    blockTimeoutMs: config.blockTimeoutMs,
    maxRetries: config.maxRetries,
  });

  // Register all processors
  worker.registerAll(allProcessors);

  return worker;
}

// =============================================================================
// Health Check Server
// =============================================================================

/**
 * Create a minimal health check server
 */
function createHealthServer(
  getHealth: () => Promise<WorkerHealth>,
  port: number
): unknown {
  return new Elysia({ name: "worker-health" })
    .get("/health", async () => {
      const health = await getHealth();
      return {
        status: health.status,
        uptime: health.uptime,
        activeJobs: health.activeJobs,
        processedJobs: health.processedJobs,
        failedJobs: health.failedJobs,
        connections: {
          redis: health.redis,
          database: health.database,
        },
        lastPollAt: health.lastPollAt?.toISOString() || null,
      };
    })
    .get("/ready", async () => {
      const health = await getHealth();
      if (health.status === "healthy") {
        return { ready: true };
      }
      throw new Error("Worker not ready");
    })
    .get("/live", () => ({ alive: true }))
    .get("/metrics", async () => {
      const health = await getHealth();
      // Prometheus-style metrics
      return [
        `# HELP hris_worker_active_jobs Number of currently processing jobs`,
        `# TYPE hris_worker_active_jobs gauge`,
        `hris_worker_active_jobs ${health.activeJobs}`,
        "",
        `# HELP hris_worker_processed_jobs_total Total number of processed jobs`,
        `# TYPE hris_worker_processed_jobs_total counter`,
        `hris_worker_processed_jobs_total ${health.processedJobs}`,
        "",
        `# HELP hris_worker_failed_jobs_total Total number of failed jobs`,
        `# TYPE hris_worker_failed_jobs_total counter`,
        `hris_worker_failed_jobs_total ${health.failedJobs}`,
        "",
        `# HELP hris_worker_uptime_seconds Worker uptime in seconds`,
        `# TYPE hris_worker_uptime_seconds gauge`,
        `hris_worker_uptime_seconds ${Math.floor(health.uptime / 1000)}`,
        "",
        `# HELP hris_worker_redis_up Redis connection status`,
        `# TYPE hris_worker_redis_up gauge`,
        `hris_worker_redis_up ${health.redis === "up" ? 1 : 0}`,
        "",
        `# HELP hris_worker_database_up Database connection status`,
        `# TYPE hris_worker_database_up gauge`,
        `hris_worker_database_up ${health.database === "up" ? 1 : 0}`,
      ].join("\n");
    })
    .listen(port);
}

// =============================================================================
// Outbox Poller
// =============================================================================

let outboxPoller: { stop: () => void } | null = null;

/**
 * Start the outbox polling process
 */
async function startOutboxPoller(): Promise<void> {
  if (!config.enableOutboxPolling) {
    console.log("[Worker] Outbox polling disabled");
    return;
  }

  const db = getDbClient();
  const cache = getCacheClient();

  // Ensure cache is connected
  await cache.connect();

  // Create a Redis client for the outbox poller
  const Redis = (await import("ioredis")).default;
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  outboxPoller = await startOutboxPolling(
    { db, cache, redis },
    {
      batchSize: config.outboxBatchSize,
      pollIntervalMs: config.outboxPollIntervalMs,
      onError: (error) => {
        console.error("[OutboxPoller] Error:", error.message);
      },
    }
  );

  console.log("[Worker] Outbox polling started");
}

/**
 * Stop the outbox polling process
 */
function stopOutboxPoller(): void {
  if (outboxPoller) {
    outboxPoller.stop();
    outboxPoller = null;
    console.log("[Worker] Outbox polling stopped");
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("HRIS Background Worker");
  console.log("===========================================");
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Consumer Group: ${config.consumerGroup}`);
  console.log(`Consumer ID: ${config.consumerId}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Health Port: ${config.healthPort}`);
  console.log("===========================================");

  // Create worker instance
  const worker = createWorker();

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}`);

    // Stop outbox poller first
    stopOutboxPoller();

    // Then shutdown worker (drains active jobs)
    await worker.shutdown(signal);

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("[Worker] Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Worker] Unhandled rejection:", reason);
  });

  // Start health check server
  const healthServer = createHealthServer(
    () => worker.getHealth(),
    config.healthPort
  );
  console.log(`[Worker] Health server listening on port ${config.healthPort}`);

  // Start outbox poller (runs independently)
  await startOutboxPoller();

  // Define streams to listen on
  const streams = [
    StreamKeys.DOMAIN_EVENTS,
    StreamKeys.NOTIFICATIONS,
    StreamKeys.EXPORTS,
    StreamKeys.PDF_GENERATION,
    StreamKeys.ANALYTICS,
    StreamKeys.BACKGROUND,
  ];

  // Start the main worker loop
  console.log("[Worker] Starting main processing loop...");

  try {
    await worker.start(streams);
  } catch (error) {
    console.error("[Worker] Fatal error:", error);
    await shutdown("error");
  }
}

// =============================================================================
// Run Worker
// =============================================================================

main().catch((error) => {
  console.error("[Worker] Failed to start:", error);
  process.exit(1);
});
