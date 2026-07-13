/**
 * shared/src/queue/redisNotifier.js
 *
 * Thin Redis Pub/Sub utility used to bridge notifications between the
 * scan-worker process and the API process.
 *
 * Flow:
 *   Worker  → publish(channel, payload)
 *   API     → subscribe(channel, callback)  → emits Socket.io event to room
 *
 * Channel name: "file:status"
 * Payload shape: JSON.stringify({ fileId, userId, status })
 */

'use strict';

const { makeRedisConnection } = require('./redisConnection');

const NOTIFY_CHANNEL = 'file:status';

/**
 * Publish a file-status notification to the Redis channel.
 * Creates a dedicated connection (pub connections must not block sub ones).
 *
 * @param {{ fileId: string, userId: string, status: string }} payload
 * @returns {Promise<void>}
 */
async function publishStatusUpdate(payload) {
  const pub = makeRedisConnection();
  try {
    await pub.publish(NOTIFY_CHANNEL, JSON.stringify(payload));
  } finally {
    pub.disconnect();
  }
}

/**
 * Subscribe to file-status notifications.
 * Calls `handler({ fileId, userId, status })` for each received message.
 * Returns the subscriber client so the caller can .disconnect() it on shutdown.
 *
 * @param {(payload: { fileId: string, userId: string, status: string }) => void} handler
 * @returns {import('ioredis').Redis} subscriber client
 */
function subscribeToStatusUpdates(handler) {
  const sub = makeRedisConnection();

  sub.subscribe(NOTIFY_CHANNEL, (err) => {
    if (err) {
      console.error('[Redis] Pub/Sub subscription error:', err.message);
    } else {
      console.log(`[Redis] Subscribed to channel: ${NOTIFY_CHANNEL}`);
    }
  });

  sub.on('message', (_channel, message) => {
    try {
      const payload = JSON.parse(message);
      handler(payload);
    } catch (err) {
      console.error('[Redis] Failed to parse status notification:', err.message);
    }
  });

  return sub;
}

module.exports = { publishStatusUpdate, subscribeToStatusUpdates, NOTIFY_CHANNEL };
