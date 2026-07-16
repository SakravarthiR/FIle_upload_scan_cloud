/**
 * api/src/routes/files.js
 *
 * File listing and download routes.
 *   GET  /files              — list all files for the authenticated user
 *   GET  /files/:id/signed-url — generate a signed, time-limited download URL
 *   GET  /files/:id/download — stream a CLEAN file (requires valid signed URL)
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const { authenticate }   = require('../middleware/auth');
const { generateSignedUrl, verifySignedUrl } = require('../utils/signedUrl');
const { db, FileRepository, AuditRepository, ACTIONS } = require('@secure-upload/shared');

const router = express.Router();
const repo   = new FileRepository(db);
const audit  = new AuditRepository(db);

// ── Helpers ────────────────────────────────────────────────────────────────
function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function getIp(req) {
  return req.ip || req.connection?.remoteAddress || null;
}

// ── GET /files ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /files:
 *   get:
 *     tags: [Files]
 *     summary: List all files for the authenticated user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of file records
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const files = await repo.findByUserId(req.user.userId, { limit: 100 });

    // Attach a fresh signed URL to each CLEAN file for convenience
    const baseUrl = getBaseUrl(req);
    const enriched = files.map((f) => ({
      ...f,
      signed_download_url: f.status === 'CLEAN' && f.download_path
        ? generateSignedUrl({ fileId: f.file_id, userId: req.user.userId, baseUrl })
        : null,
    }));

    audit.log({
      userId: req.user.userId, action: ACTIONS.FILE_LIST,
      ip: getIp(req), metadata: { count: files.length },
    }).catch(() => {});

    return res.json({ files: enriched });
  } catch (err) {
    return next(err);
  }
});

// ── GET /files/:fileId/signed-url ──────────────────────────────────────────

/**
 * @openapi
 * /files/{fileId}/signed-url:
 *   get:
 *     tags: [Files]
 *     summary: Generate a signed, expiring download URL
 *     description: >
 *       Returns a signed URL valid for 15 minutes. The URL is user-bound —
 *       it cannot be used by another user. Suitable for sharing with a download
 *       button or embedding in an email.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Signed URL and expiry
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: File not yet CLEAN
 */
router.get('/:fileId/signed-url', authenticate, async (req, res, next) => {
  try {
    const file = await repo.findById(req.params.fileId);

    if (!file) {
      return res.status(404).json({ error: 'NotFound', message: 'File not found.' });
    }
    if (file.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied.' });
    }
    if (file.status !== 'CLEAN' || !file.download_path) {
      return res.status(409).json({ error: 'NotReady', message: 'File is not yet available for download.' });
    }

    const baseUrl   = getBaseUrl(req);
    const TTL_MS    = 15 * 60 * 1000; // 15 minutes
    const signedUrl = generateSignedUrl({
      fileId: file.file_id,
      userId: req.user.userId,
      baseUrl,
      ttlMs:  TTL_MS,
    });

    return res.json({
      signed_url: signedUrl,
      expires_in: 900, // seconds
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /files/:fileId/download ────────────────────────────────────────────

/**
 * @openapi
 * /files/{fileId}/download:
 *   get:
 *     tags: [Files]
 *     summary: Download a clean file via signed URL
 *     description: >
 *       Streams the file to the client. Requires a valid signed URL obtained
 *       from GET /files/{fileId}/signed-url. The link is time-limited (15 min)
 *       and user-bound — it cannot be shared with other users.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sig
 *         required: true
 *         schema: { type: string }
 *         description: HMAC-SHA256 signature
 *       - in: query
 *         name: exp
 *         required: true
 *         schema: { type: string }
 *         description: Expiry timestamp (Unix ms)
 *     responses:
 *       200:
 *         description: Binary file stream
 *         content:
 *           application/octet-stream:
 *             schema: { type: string, format: binary }
 *       401:
 *         description: Missing, invalid or expired signed URL
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       410:
 *         description: File no longer on disk
 */
router.get('/:fileId/download', authenticate, async (req, res, next) => {
  try {
    const { sig, exp } = req.query;

    // ── Verify signed URL ────────────────────────────────────────────────────
    const verification = verifySignedUrl({
      fileId: req.params.fileId,
      userId: req.user.userId,
      sig,
      exp,
    });

    if (!verification.valid) {
      return res.status(401).json({
        error:   'InvalidSignature',
        message: verification.reason,
      });
    }

    // ── Load file record ─────────────────────────────────────────────────────
    const file = await repo.findById(req.params.fileId);

    if (!file) {
      return res.status(404).json({ error: 'NotFound', message: 'File not found.' });
    }
    if (file.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied.' });
    }
    if (file.status !== 'CLEAN' || !file.download_path) {
      return res.status(409).json({ error: 'NotReady', message: 'File not available for download.' });
    }
    if (!fs.existsSync(file.download_path)) {
      return res.status(410).json({ error: 'Gone', message: 'File no longer on disk.' });
    }

    // ── Audit log ────────────────────────────────────────────────────────────
    audit.log({
      userId: req.user.userId, action: ACTIONS.FILE_DOWNLOAD,
      resourceType: 'file', resourceId: file.file_id,
      ip: getIp(req),
      metadata: { filename: file.original_filename },
    }).catch(() => {});

    // ── Stream ───────────────────────────────────────────────────────────────
    return res.download(file.download_path, file.original_filename);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
