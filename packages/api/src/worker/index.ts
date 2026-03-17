/**
 * Worker Entry Point
 *
 * Runs background workers for the Staffora platform.
 * Can be started separately from the main API server.
 *
 * Connection pool strategy:
 * Both the OutboxProcessor and Scheduler share the singleton postgres.js
 * pool (via getDbClient()) and a single Redis instance, avoiding duplicate
 * connection pools. See packages/api/src/plugins/db.ts for connection budget.
 */

import Redis from "ioredis";
import { OutboxProcessor } from "./outbox-processor";
import { Scheduler } from "./scheduler";
import { getDbClient } from "../plugins/db";
import { getRedisUrl } from "../config/database";

const WORKER_TYPE = process.env["WORKER_TYPE"] || "all";

async function main() {
  console.log(`[Worker] Starting worker type: ${WORKER_TYPE}`);

  // Share a single postgres.js pool and Redis instance across all workers
  // to avoid creating duplicate connection pools.
  const db = getDbClient();
  const sharedSql = db.client;
  const sharedRedis = new Redis(getRedisUrl());

  if (WORKER_TYPE === "outbox" || WORKER_TYPE === "all") {
    const outboxProcessor = new OutboxProcessor(sharedSql, sharedRedis);
    outboxProcessor.start();
  }

  if (WORKER_TYPE === "scheduler" || WORKER_TYPE === "all") {
    const scheduler = new Scheduler(sharedSql, sharedRedis);
    scheduler.start();
  }

  console.log("[Worker] Workers started");
}

main().catch((error) => {
  console.error("[Worker] Failed to start:", error);
  process.exit(1);
});
