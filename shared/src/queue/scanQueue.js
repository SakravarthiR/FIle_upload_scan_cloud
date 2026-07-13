/**
 * shared/src/queue/scanQueue.js
 *
 * Defines the "scan-queue" BullMQ Queue (producer side).
 *
 * The Queue instance is used by the API to enqueue jobs.
 * The scan-worker creates its own Worker bound to the same queue name.
 *
 * Job payload shape:
 * {
 *   fileId:         string  — UUID from the `files` table
 *   quarantinePath: string  — Absolute path where multer saved the file
 * }
 *
 * Usage (API side):
 *   const { scanQueue } = require('@secure-upload/shared');
 *   await scanQueue.add('scan', { fileId, quarantinePath });
 */

'use strict';

const { Queue } = require('bullmq');
const { makeRedisConnection } = require('./redisConnection');

const QUEUE_NAME = 'scan-queue';

// ── Default job options ────────────────────────────────────────────────────
const defaultJobOptions = {
  attempts:    3,          // retry up to 3 times on failure
  backoff: {
    type:    'exponential',
    delay:   5_000,        // 5 s, 10 s, 20 s
  },
  removeOnComplete: {
    age:   86_400,         // keep completed jobs for 24 h
    count: 500,            // but no more than 500
  },
  removeOnFail: {
    age: 7 * 86_400,       // keep failed jobs for 7 days for audit
  },
};

// ── Singleton Queue instance ───────────────────────────────────────────────
const scanQueue = new Queue(QUEUE_NAME, {
  connection:     makeRedisConnection(),
  defaultJobOptions,
});

scanQueue.on('error', (err) => {
  console.error('[ScanQueue] Queue error:', err.message);
});

/**
 * Enqueue a scan job.
 *
 * @param {{
 *   fileId:         string,
 *   quarantinePath: string,
 * }} payload
 * @returns {Promise<import('bullmq').Job>} The created BullMQ job
 */
async function enqueueScanJob({ fileId, quarantinePath }) {
  const job = await scanQueue.add(
    'scan',                       // job name (used for filtering in dashboards)
    { fileId, quarantinePath },
    {
      jobId: fileId,              // idempotent — same file can't be queued twice
    }
  );

  console.log(`[ScanQueue] Job enqueued: jobId=${job.id}, fileId=${fileId}`);
  return job;
}

module.exports = { scanQueue, enqueueScanJob, QUEUE_NAME };
