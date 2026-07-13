/**
 * index.js — API server entry point
 *
 * Responsibilities:
 *   1. Ensure the quarantine directory exists before accepting any requests
 *   2. Start the Express HTTP server
 *   3. Attach the Socket.io WebSocket server (Step 8)
 *   4. Handle graceful shutdown on SIGTERM / SIGINT
 */

'use strict';

const http   = require('http');
const app    = require('./app');
const config = require('./config');
const { ensureQuarantineDir } = require('./utils/fileHelpers');
const { db } = require('@secure-upload/shared');
const { initNotifier, shutdownNotifier } = require('./ws/notifier');

// ── Pre-flight ─────────────────────────────────────────────────────────────
ensureQuarantineDir();
console.log(`[API] Quarantine directory ready: ${config.upload.quarantineDir}`);

// ── Create HTTP server (required to share with Socket.io) ─────────────────
const server = http.createServer(app);

// ── Attach Socket.io + Redis Pub/Sub subscriber ────────────────────────────
initNotifier(server);

// ── Start listening ────────────────────────────────────────────────────────
server.listen(config.port, () => {
  console.log(`[API] Server running on http://localhost:${config.port}`);
  console.log(`[API] Environment : ${config.env}`);
  console.log(`[API] Max file size: ${config.upload.maxFileSizeBytes / (1024 * 1024)} MB`);
  console.log(`[API] Allowed exts : ${[...config.upload.allowedExtensions].join(', ')}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[API] ${signal} received — shutting down gracefully...`);

  server.close(async () => {
    console.log('[API] HTTP server closed.');
    await shutdownNotifier();
    await db.shutdown();
    process.exit(0);
  });

  // Force-kill after 10 seconds if connections don't drain
  setTimeout(() => {
    console.error('[API] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
