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
const UserRepository = require('./db/UserRepository');
const { AuditRepository, ACTIONS } = require('./db/AuditRepository');
const { scanQueue, enqueueScanJob, QUEUE_NAME } = require('./queue/scanQueue');
const { makeRedisConnection, redisOpts }        = require('./queue/redisConnection');
const { publishStatusUpdate, subscribeToStatusUpdates } = require('./queue/redisNotifier');

module.exports = {
  db,
  FileRepository,
  UserRepository,
  /** Append-only audit log repository */
  AuditRepository,
  /** Audit action name constants */
  ACTIONS,
  scanQueue,
  enqueueScanJob,
  QUEUE_NAME,
  makeRedisConnection,
  redisOpts,
  publishStatusUpdate,
  subscribeToStatusUpdates,
};
