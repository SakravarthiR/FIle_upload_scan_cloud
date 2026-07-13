/**
 * api/src/ws/notifier.js
 *
 * Socket.io server + Redis Pub/Sub subscriber.
 *
 * Responsibilities:
 *   1. Attach a Socket.io server to the existing HTTP server.
 *   2. Authenticate each connecting socket (same JWT used by the REST API).
 *   3. Join the socket to a room named after the user's userId.
 *   4. Subscribe to the Redis "file:status" channel.
 *   5. For every Redis message, emit "file:status" to the matching user room.
 *
 * Room naming convention: room = userId (UUID).
 * This means only the owner of a file receives its status update.
 *
 * Client usage (browser / curl WebSocket):
 *   const socket = io('http://localhost:3000', {
 *     auth: { token: '<JWT>' }
 *   });
 *   socket.on('file:status', ({ fileId, status }) => { ... });
 */

'use strict';

const { Server }  = require('socket.io');
const jwt         = require('jsonwebtoken');
const { subscribeToStatusUpdates } = require('@secure-upload/shared');
const config = require('../config');

let _io  = null; // singleton Socket.io server
let _sub = null; // singleton Redis subscriber

/**
 * Initialise the Socket.io server and Redis subscriber.
 * Must be called once after the HTTP server is created.
 *
 * @param {import('http').Server} httpServer
 */
function initNotifier(httpServer) {
  if (_io) return; // already initialised

  // ── Create Socket.io server ───────────────────────────────────────────────
  _io = new Server(httpServer, {
    cors: {
      origin:  '*',   // tighten in production
      methods: ['GET', 'POST'],
    },
    // Namespace: default "/"
  });

  // ── JWT authentication middleware ─────────────────────────────────────────
  _io.use((socket, next) => {
    const token = socket.handshake.auth?.token
               || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication error: token missing'));
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret, {
        algorithms: [config.jwt.algorithm],
      });
      socket.data.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // ── Socket lifecycle ──────────────────────────────────────────────────────
  _io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.join(userId);  // room name = userId UUID

    console.log(`[WS] Client connected  : socketId=${socket.id} userId=${userId}`);

    socket.on('disconnect', (reason) => {
      console.log(`[WS] Client disconnected: socketId=${socket.id} reason=${reason}`);
    });
  });

  console.log('[WS] Socket.io server attached.');

  // ── Redis Pub/Sub subscriber ──────────────────────────────────────────────
  _sub = subscribeToStatusUpdates(({ fileId, userId, status }) => {
    // Emit only to the user's own room
    _io.to(userId).emit('file:status', { fileId, status });
    console.log(`[WS] ↓ Emitted file:status → room=${userId} | fileId=${fileId} status=${status}`);
  });
}

/**
 * Gracefully shut down the notifier (close Socket.io + Redis subscriber).
 *
 * @returns {Promise<void>}
 */
async function shutdownNotifier() {
  if (_sub) {
    _sub.disconnect();
    _sub = null;
  }
  if (_io) {
    await new Promise((resolve) => _io.close(resolve));
    _io = null;
  }
}

module.exports = { initNotifier, shutdownNotifier };
