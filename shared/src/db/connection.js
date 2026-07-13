/**
 * connection.js
 *
 * Singleton Knex instance used across the entire monorepo.
 * Import this module wherever you need database access — it
 * creates one connection pool and reuses it for the lifetime
 * of the process.
 *
 * Usage:
 *   const db = require('@secure-upload/shared/src/db/connection');
 *   const rows = await db('files').where({ file_id: id });
 */

'use strict';

const path   = require('path');
const knex   = require('knex');
const config = require('./knexfile');

// ── Determine environment ──────────────────────────────────────────────────
const env = process.env.NODE_ENV || 'development';

if (!config[env]) {
  throw new Error(
    `No Knex config found for environment "${env}". ` +
    `Valid options: ${Object.keys(config).join(', ')}`
  );
}

// ── Create singleton ───────────────────────────────────────────────────────
/** @type {import('knex').Knex} */
const db = knex(config[env]);

// ── Verify connectivity on first import ────────────────────────────────────
// We purposely do NOT await this here to avoid blocking the module loader.
// A failed DB at startup will surface quickly on the first real query.
db.raw('SELECT 1')
  .then(() => {
    console.log(`[DB] Connected to PostgreSQL (env: ${env}, db: ${config[env].connection.database})`);
  })
  .catch((err) => {
    console.error('[DB] Connection verification failed:', err.message);
    // Do not exit here — let callers handle errors on individual queries
    // so the process can still boot and surface a proper HTTP error.
  });

/**
 * Graceful shutdown helper.
 * Call this in your SIGTERM / SIGINT handlers to drain the pool cleanly.
 *
 * @returns {Promise<void>}
 */
db.shutdown = async function () {
  await db.destroy();
  console.log('[DB] Connection pool destroyed.');
};

module.exports = db;
