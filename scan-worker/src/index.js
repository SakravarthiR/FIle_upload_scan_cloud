/**
 * scan-worker/src/index.js
 *
 * Entry point for the scan-worker service.
 *
 * Creates a BullMQ Worker that consumes jobs from "scan-queue" and
 * runs them through the scan pipeline in processor.js.
 *
 * One Worker can process multiple jobs concurrently (controlled by
 * WORKER_CONCURRENCY env var, default 2).
 */

'use strict';

const { Worker } = require('bullmq');

const config  = require('./config');
const { processJob, ensureCleanDir } = require('./processor');
const { QUEUE_NAME, makeRedisConnection, db } = require('@secure-upload/shared');

// ── Pre-flight ─────────────────────────────────────────────────────────────
ensureCleanDir();
console.log(`[Worker] Clean storage ready : ${config.storage.cleanDir}`);
console.log(`[Worker] Quarantine dir      : ${config.storage.quarantineDir}`);
console.log(`[Worker] ClamAV endpoint     : ${config.clamav.host}:${config.clamav.port}`);
console.log(`[Worker] Concurrency         : ${config.workerConcurrency}`);

// ── BullMQ Worker ──────────────────────────────────────────────────────────
// Each Worker needs its own dedicated Redis connection (BullMQ requirement).
const worker = new Worker(
  QUEUE_NAME,
  processJob,
  {
    connection:  makeRedisConnection(),
    concurrency: config.workerConcurrency,
  }
);

// ── Worker event listeners ─────────────────────────────────────────────────
worker.on('active', (job) => {
  console.log(`[Worker] ▷ Job active  : ${job.id} | fileId=${job.data.fileId}`);
});

worker.on('completed', (job) => {
  console.log(`[Worker] ✓ Job complete: ${job.id} | fileId=${job.data.fileId}`);
});

worker.on('failed', (job, err) => {
  const attempt   = job.attemptsMade;
  const maxRetries = job.opts.attempts ?? 1;
  console.error(
    `[Worker] ✗ Job failed  : ${job?.id} | attempt=${attempt}/${maxRetries} | ${err.message}`
  );
});

worker.on('error', (err) => {
  console.error('[Worker] Worker-level error:', err.message);
});

worker.on('stalled', (jobId) => {
  console.warn(`[Worker] ⚠ Job stalled : ${jobId}`);
});

console.log(`[Worker] Listening on queue: "${QUEUE_NAME}"`);

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[Worker] ${signal} — shutting down gracefully...`);

  // Close stops accepting new jobs; waits for active jobs to finish
  await worker.close();
  console.log('[Worker] BullMQ worker closed.');

  await db.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
