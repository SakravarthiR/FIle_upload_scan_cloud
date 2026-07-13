/**
 * scan-worker/src/processor.js
 *
 * BullMQ job processor — orchestrates the scan pipeline and delegates
 * final outcome handling entirely to decisionEngine.js.
 *
 * Pipeline stages:
 *   1. Validate  — confirm file still exists on disk
 *   2. Hash      — compute SHA-256, persist to DB
 *   3. Signature — magic-byte check vs declared extension
 *   4. Ping      — verify clamd is reachable (fast fail before streaming)
 *   5. Version   — capture engine + definition version for audit trail
 *   6. Scan      — stream file bytes to clamd via INSTREAM
 *   7. Decide    — delegate to decisionEngine (move / delete / retry / flag)
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const FileType = require('file-type');

const clamav   = require('./scanner/clamavClient');
const { decide } = require('./decisionEngine');
const config   = require('./config');
const { db, FileRepository } = require('@secure-upload/shared');

const repo = new FileRepository(db);

// ── Startup helper ─────────────────────────────────────────────────────────

/**
 * Ensure the clean-storage directory exists.
 * Called once at worker startup from index.js.
 */
function ensureCleanDir() {
  fs.mkdirSync(config.storage.cleanDir, { recursive: true });
}

// ── Stage helpers ──────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of a file from a stream.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data',  (chunk) => hash.update(chunk));
    stream.on('end',   ()      => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Validate magic bytes against the declared extension.
 *
 * Returns { isValid: true } when the bytes match (or when the file is
 * a format that has no binary magic bytes, like plain text).
 *
 * @param {string} filePath
 * @param {string} originalFilename
 * @returns {Promise<{ isValid: boolean, reason?: string }>}
 */
async function checkMagicBytes(filePath, originalFilename) {
  const declaredExt = path.extname(originalFilename).toLowerCase().replace(/^\./, '');
  const fileInfo    = await FileType.fromFile(filePath);

  if (!fileInfo) {
    // No magic bytes → acceptable only for inherently text-based formats
    const binaryExts = new Set([
      'pdf','zip','png','jpg','jpeg','gif','mp4','mp3','wav',
      'tar','gz','7z','doc','docx','xls','xlsx','ppt','pptx',
    ]);
    if (binaryExts.has(declaredExt)) {
      return {
        isValid: false,
        reason: `Mismatched signature: declared .${declaredExt} but no valid magic bytes found.`,
      };
    }
    return { isValid: true };
  }

  const detectedExt = fileInfo.ext.toLowerCase();

  // Normalise common aliased extensions and Office ZIP container
  const isMatch = (
    detectedExt === declaredExt ||
    (detectedExt === 'jpg'  && declaredExt === 'jpeg') ||
    (detectedExt === 'jpeg' && declaredExt === 'jpg')  ||
    (detectedExt === 'zip'  && ['docx','xlsx','pptx'].includes(declaredExt))
  );

  if (!isMatch) {
    return {
      isValid: false,
      reason: `Mismatched signature: declared .${declaredExt} but detected .${detectedExt} magic bytes.`,
    };
  }

  return { isValid: true };
}

// ── Main job processor ─────────────────────────────────────────────────────

/**
 * Process a single scan job.
 *
 * @param {import('bullmq').Job<{ fileId: string, quarantinePath: string }>} job
 */
async function processJob(job) {
  const { fileId, quarantinePath } = job.data;
  const attemptsMade = job.attemptsMade;
  const maxAttempts  = job.opts.attempts ?? 3;

  console.log(`[Worker] ▶ Job ${job.id} | attempt=${attemptsMade}/${maxAttempts} | fileId=${fileId}`);
  await job.updateProgress(5);

  // ── Stage 1: Load DB record ───────────────────────────────────────────────
  const fileRecord = await repo.findById(fileId);
  if (!fileRecord) {
    throw new Error(`No DB record for fileId=${fileId}`);
  }
  const userId = fileRecord.user_id;

  // ── Stage 2: File exists on disk? ────────────────────────────────────────
  if (!fs.existsSync(quarantinePath)) {
    return decide({
      fileId, userId, quarantinePath,
      outcome: 'ERROR',
      meta: {
        reason: `Quarantine file not found: ${quarantinePath}`,
        scanTime: new Date(),
        attemptsMade, maxAttempts,
      },
    });
  }
  await job.updateProgress(15);

  // ── Stage 3: SHA-256 hash ─────────────────────────────────────────────────
  console.log(`[Worker] Hashing...`);
  const sha256Hash = await computeSha256(quarantinePath);
  await repo.update(fileId, { sha256_hash: sha256Hash });
  console.log(`[Worker] ✓ SHA-256: ${sha256Hash}`);
  await job.updateProgress(30);

  // ── Stage 4: Magic-byte signature check ──────────────────────────────────
  console.log(`[Worker] Checking magic bytes...`);
  const sigCheck = await checkMagicBytes(quarantinePath, fileRecord.original_filename);
  if (!sigCheck.isValid) {
    console.warn(`[Worker] ✗ Signature mismatch: ${sigCheck.reason}`);
    // Signature failure is deterministic — mark ERROR and do NOT retry
    await repo.markError(fileId, { reason: sigCheck.reason });
    // Notify but don't re-throw (no point retrying a deterministic failure)
    const { publishStatusUpdate } = require('@secure-upload/shared');
    await publishStatusUpdate({ fileId, userId, status: 'ERROR' }).catch(() => {});
    return;
  }
  console.log(`[Worker] ✓ Signature OK`);
  await job.updateProgress(45);

  // ── Stage 5: Ping clamd ───────────────────────────────────────────────────
  console.log(`[Worker] Pinging clamd...`);
  const alive = await clamav.ping();
  if (!alive) {
    return decide({
      fileId, userId, quarantinePath,
      outcome: 'ERROR',
      meta: { reason: 'clamd did not respond to PING', scanTime: new Date(), attemptsMade, maxAttempts },
    });
  }
  await job.updateProgress(55);

  // ── Stage 6: Get scanner version ─────────────────────────────────────────
  const scannerVersion = await clamav.version();
  console.log(`[Worker] ✓ clamd version: ${scannerVersion}`);
  await job.updateProgress(65);

  // ── Stage 7: ClamAV scan ─────────────────────────────────────────────────
  console.log(`[Worker] ⟳ Scanning ${path.basename(quarantinePath)}...`);
  const scanTime = new Date();

  let scanResult;
  try {
    scanResult = await clamav.scanFile(quarantinePath);
  } catch (err) {
    return decide({
      fileId, userId, quarantinePath,
      outcome: 'ERROR',
      meta: { reason: `ClamAV scan error: ${err.message}`, scannerVersion, scanTime, attemptsMade, maxAttempts },
    });
  }
  await job.updateProgress(85);

  // ── Stage 8: Decision engine ─────────────────────────────────────────────
  if (scanResult.isInfected) {
    return decide({
      fileId, userId, quarantinePath,
      outcome: 'INFECTED',
      meta: { virusName: scanResult.virusName, scannerVersion, scanTime },
    });
  }

  return decide({
    fileId, userId, quarantinePath,
    outcome: 'CLEAN',
    meta: { scannerVersion, scanTime },
  });
}

module.exports = { processJob, ensureCleanDir };
