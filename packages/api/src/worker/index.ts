/**
 * Worker Entry Point
 *
 * Runs background workers for the HRIS platform.
 * Can be started separately from the main API server.
 */

import { OutboxProcessor } from "./outbox-processor";
import { Scheduler } from "./scheduler";

const WORKER_TYPE = process.env["WORKER_TYPE"] || "all";

async function main() {
  console.log(`[Worker] Starting worker type: ${WORKER_TYPE}`);

  if (WORKER_TYPE === "outbox" || WORKER_TYPE === "all") {
    const outboxProcessor = new OutboxProcessor();
    outboxProcessor.start();
  }

  if (WORKER_TYPE === "scheduler" || WORKER_TYPE === "all") {
    const scheduler = new Scheduler();
    scheduler.start();
  }

  console.log("[Worker] Workers started");
}

main().catch((error) => {
  console.error("[Worker] Failed to start:", error);
  process.exit(1);
});
