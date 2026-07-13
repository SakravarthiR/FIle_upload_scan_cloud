/**
 * shared/src/queue/redisConnection.js
 *
 * Singleton ioredis connection used by BullMQ throughout the monorepo.
 * BullMQ requires a separate connection for its internal subscriber —
 * we export a factory function so callers can create isolated connections
 * (Queue, Worker, QueueEvents each need their own instance).
 *
 * Usage:
 *   const { makeRedisConnection, redisOpts } = require('@secure-upload/shared/src/queue/redisConnection');
 *   const conn = makeRedisConnection();   // for a Queue or Worker
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });

const IORedis = require('ioredis');

// ── Connection options (read from env) ─────────────────────────────────────
const redisOpts = {
  host:              process.env.REDIS_HOST     || 'localhost',
  port:              Number(process.env.REDIS_PORT || '6379'),
  password:          process.env.REDIS_PASSWORD || undefined,
  db:                Number(process.env.REDIS_DB  || '0'),
  // BullMQ recommendation: disable auto-reconnect on certain fatal errors
  maxRetriesPerRequest: null,
  enableReadyCheck:  false,
};

/**
 * Create a fresh ioredis connection.
 * BullMQ needs separate connections for Queue, Worker, and QueueEvents.
 * Always call this factory — never share a single connection across roles.
 *
 * @returns {import('ioredis').Redis}
 */
function makeRedisConnection() {
  const client = new IORedis(redisOpts);

  client.on('connect', () =>
    console.log(`[Redis] Connected to ${redisOpts.host}:${redisOpts.port}`)
  );
  client.on('error', (err) =>
    console.error('[Redis] Connection error:', err.message)
  );

  return client;
}

module.exports = { makeRedisConnection, redisOpts };
