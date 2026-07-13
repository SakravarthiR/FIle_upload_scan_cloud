/**
 * scan-worker/src/config.js
 *
 * All configuration for the scan-worker service.
 * Loaded once at startup — env vars are read from the root .env file.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',

  // BullMQ worker concurrency — how many jobs run in parallel
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY || '2'),

  // ClamAV clamd daemon TCP endpoint
  clamav: {
    host:            process.env.CLAMAV_HOST    || 'localhost',
    port:            Number(process.env.CLAMAV_PORT || '3310'),
    // How long to wait for clamd to respond (ms)
    connectTimeoutMs: Number(process.env.CLAMAV_CONNECT_TIMEOUT_MS || '10000'),
    // How long a full scan may take before we give up (ms)
    scanTimeoutMs:    Number(process.env.CLAMAV_SCAN_TIMEOUT_MS    || '120000'),
    // Chunk size for INSTREAM uploads (bytes)
    chunkSize:        Number(process.env.CLAMAV_CHUNK_SIZE          || String(64 * 1024)),
  },

  // Storage — where CLEAN files are moved after a successful scan
  // Structured as a root + sub-dirs so it can be swapped for an S3 prefix later
  storage: {
    cleanDir: (() => {
      const p = process.env.CLEAN_DIR || require('path').resolve(__dirname, '../../storage/clean');
      return require('path').isAbsolute(p) ? p : require('path').resolve(__dirname, '../..', p);
    })(),
    quarantineDir: (() => {
      const p = process.env.QUARANTINE_DIR || require('path').resolve(__dirname, '../../quarantine');
      return require('path').isAbsolute(p) ? p : require('path').resolve(__dirname, '../..', p);
    })(),
  },
};

module.exports = config;
