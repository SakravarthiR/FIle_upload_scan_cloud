/**
 * shared/src/index.js
 *
 * Public surface area of the @secure-upload/shared package.
 * Import from this file in both the API and scan-worker services.
 *
 * Example:
 *   const { db, FileRepository, enqueueScanJob, scanQueue } = require('@secure-upload/shared');
 */

'use strict';

const db             = require('./db/connection');
const FileRepository = require('./db/FileRepository');
const { scanQueue, enqueueScanJob, QUEUE_NAME } = require('./queue/scanQueue');
const { makeRedisConnection, redisOpts }        = require('./queue/redisConnection');
const { publishStatusUpdate, subscribeToStatusUpdates } = require('./queue/redisNotifier');

module.exports = {
  /** Singleton Knex instance — use directly for raw queries if needed */
  db,
  /** Data-access class for the `files` table */
  FileRepository,
  /** BullMQ Queue instance (producer side) */
  scanQueue,
  /** Convenience function — enqueues a scan job with idempotent jobId */
  enqueueScanJob,
  /** Queue name constant — use in Worker setup inside scan-worker */
  QUEUE_NAME,
  /** Factory: create a fresh ioredis connection (Worker/QueueEvents need their own) */
  makeRedisConnection,
  /** Raw ioredis connection options (host, port, password, db) */
  redisOpts,
  /** Publish a file:status event over Redis Pub/Sub (worker → API bridge) */
  publishStatusUpdate,
  /** Subscribe to file:status events on the API side */
  subscribeToStatusUpdates,
};
