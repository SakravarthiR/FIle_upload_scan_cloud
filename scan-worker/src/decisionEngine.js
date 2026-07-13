/**
 * scan-worker/src/decisionEngine.js
 *
 * Standalone module that maps a scan result to a concrete action.
 *
 * Possible outcomes and what this module does for each:
 *
 *   CLEAN    → move file from quarantine to clean-storage
 *              update DB: status=CLEAN, download_path, scan_time, scanner_version
 *              publish Redis notification → API → Socket.io
 *
 *   INFECTED → delete the quarantined file (do NOT keep it on disk)
 *              update DB: status=INFECTED, virus_name, scan_time, scanner_version
 *              publish Redis notification
 *
 *   ERROR    → update DB: status=ERROR, scan_time, scanner_version
 *              throw error so BullMQ retries (up to 3 attempts)
 *              publish Redis notification only when retries exhausted
 *
 *   UNKNOWN  → update DB: status=UNKNOWN, scan_time, scanner_version
 *              publish Redis notification (file flagged for manual review)
 *
 * All outcomes also persist scan_time and scanner_version.
 *
 * @module decisionEngine
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const config = require('./config');
const { db, FileRepository, publishStatusUpdate } = require('@secure-upload/shared');

const repo = new FileRepository(db);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Move a file, handling cross-device renames gracefully.
 *
 * @param {string} src
 * @param {string} dest
 */
async function moveFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.promises.copyFile(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

/**
 * Safely delete a file; swallows ENOENT (already gone).
 *
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Notify the API process via Redis Pub/Sub so it can push to the user's socket room.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {string} status
 */
async function notify(fileId, userId, status) {
  try {
    await publishStatusUpdate({ fileId, userId, status });
    console.log(`[Decision] ↑ Published notification: fileId=${fileId} status=${status} user=${userId}`);
  } catch (err) {
    // Non-fatal — log but don't fail the pipeline
    console.error(`[Decision] ⚠ Notification publish failed: ${err.message}`);
  }
}

// ── Outcome handlers ───────────────────────────────────────────────────────

/**
 * Handle a CLEAN scan result.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {string} quarantinePath
 * @param {{ scannerVersion: string, scanTime: Date }} meta
 */
async function handleClean(fileId, userId, quarantinePath, { scannerVersion, scanTime }) {
  const ext       = path.extname(quarantinePath);
  const cleanPath = path.join(config.storage.cleanDir, `${fileId}${ext}`);

  await moveFile(quarantinePath, cleanPath);

  await repo.markClean(fileId, {
    scanner_version: scannerVersion,
    download_path:   cleanPath,
    scan_time:       scanTime,
  });

  console.log(`[Decision] ✅ CLEAN → moved to ${cleanPath}`);
  await notify(fileId, userId, 'CLEAN');
}

/**
 * Handle an INFECTED scan result.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {string} quarantinePath
 * @param {{ virusName: string, scannerVersion: string, scanTime: Date }} meta
 */
async function handleInfected(fileId, userId, quarantinePath, { virusName, scannerVersion, scanTime }) {
  // Destroy the file — we do NOT keep malware on disk
  safeUnlink(quarantinePath);

  await repo.markInfected(fileId, {
    virus_name:      virusName,
    scanner_version: scannerVersion,
    quarantine_path: null,   // file deleted
    scan_time:       scanTime,
  });

  console.log(`[Decision] 🦠 INFECTED (${virusName}) → file deleted`);
  await notify(fileId, userId, 'INFECTED');
}

/**
 * Handle an ERROR outcome (transient scan failure).
 * Throws so BullMQ can retry (max 3 retries configured on the queue).
 * Only publishes a notification when all retries are exhausted.
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {{ reason: string, scannerVersion?: string, scanTime: Date, attemptsMade: number, maxAttempts: number }} meta
 */
async function handleError(fileId, userId, { reason, scannerVersion, scanTime, attemptsMade, maxAttempts }) {
  const isExhausted = attemptsMade >= maxAttempts;

  await repo.update(fileId, {
    status:          'ERROR',
    virus_name:      reason,
    scanner_version: scannerVersion ?? null,
    scan_time:       scanTime,
  });

  if (isExhausted) {
    console.error(`[Decision] ✗ ERROR (all ${maxAttempts} retries exhausted): ${reason}`);
    await notify(fileId, userId, 'ERROR');
  } else {
    console.warn(`[Decision] ⚠ ERROR (attempt ${attemptsMade}/${maxAttempts}): ${reason} — will retry`);
  }

  // Throw so BullMQ knows to retry
  throw new Error(reason);
}

/**
 * Handle an UNKNOWN scan outcome (e.g. clamd returned an unrecognised response).
 *
 * @param {string} fileId
 * @param {string} userId
 * @param {{ scannerVersion?: string, scanTime: Date }} meta
 */
async function handleUnknown(fileId, userId, { scannerVersion, scanTime }) {
  await repo.update(fileId, {
    status:          'UNKNOWN',
    scanner_version: scannerVersion ?? null,
    scan_time:       scanTime,
  });

  console.warn(`[Decision] ❓ UNKNOWN outcome — file flagged for manual review`);
  await notify(fileId, userId, 'UNKNOWN');
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Apply the decision engine to a completed (or failed) scan.
 *
 * @param {object} params
 * @param {string}  params.fileId
 * @param {string}  params.userId
 * @param {string}  params.quarantinePath
 * @param {'CLEAN'|'INFECTED'|'ERROR'|'UNKNOWN'} params.outcome
 * @param {object}  params.meta
 * @param {string}  [params.meta.virusName]       - INFECTED only
 * @param {string}  [params.meta.reason]           - ERROR only
 * @param {string}  [params.meta.scannerVersion]
 * @param {Date}    [params.meta.scanTime]
 * @param {number}  [params.meta.attemptsMade]     - ERROR only
 * @param {number}  [params.meta.maxAttempts]      - ERROR only
 */
async function decide({ fileId, userId, quarantinePath, outcome, meta = {} }) {
  const scanTime = meta.scanTime ?? new Date();

  console.log(`[Decision] Outcome=${outcome} | fileId=${fileId}`);

  switch (outcome) {
    case 'CLEAN':
      return handleClean(fileId, userId, quarantinePath, {
        scannerVersion: meta.scannerVersion,
        scanTime,
      });

    case 'INFECTED':
      return handleInfected(fileId, userId, quarantinePath, {
        virusName:      meta.virusName,
        scannerVersion: meta.scannerVersion,
        scanTime,
      });

    case 'ERROR':
      return handleError(fileId, userId, {
        reason:         meta.reason,
        scannerVersion: meta.scannerVersion,
        scanTime,
        attemptsMade:   meta.attemptsMade ?? 1,
        maxAttempts:    meta.maxAttempts  ?? 3,
      });

    case 'UNKNOWN':
      return handleUnknown(fileId, userId, {
        scannerVersion: meta.scannerVersion,
        scanTime,
      });

    default:
      throw new Error(`[Decision] Unknown outcome value: "${outcome}"`);
  }
}

module.exports = { decide };
