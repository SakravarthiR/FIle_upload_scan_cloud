/**
 * routes/upload.js
 *
 * POST /upload
 * ─────────────────────────────────────────────────────────────────
 * Pipeline:
 *   1. [Middleware] authenticate    — verify Bearer JWT, attach req.user
 *   2. [Middleware] uploadLimiter   — 20 uploads / 15 min per IP
 *   3. [Middleware] multer          — stream file to quarantine dir
 *   4. [Middleware] validateMimeType — magic-byte check vs declared extension
 *   5. [Handler]   extension check  — belt-and-braces allowlist check
 *   6. [Handler]   DB insert        — creates a PENDING row in `files`
 *   7. [Handler]   enqueue job      — sends file to BullMQ scan queue
 *   8. [Handler]   response         — returns { file_id, status, original_filename }
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const express        = require('express');
const fs             = require('fs');
const { authenticate }    = require('../middleware/auth');
const { uploadLimiter }   = require('../middleware/rateLimiter');
const { upload }          = require('../utils/multerConfig');
const { validateMimeType } = require('../middleware/mimeValidator');
const { sha256OfFile, isAllowedExtension } = require('../utils/fileHelpers');
const { db, FileRepository, enqueueScanJob } = require('@secure-upload/shared');

const router = express.Router();
const repo   = new FileRepository(db);

/**
 * @openapi
 * /upload:
 *   post:
 *     tags: [Upload]
 *     summary: Upload a file for malware scanning
 *     description: >
 *       Accepts a single file via `multipart/form-data`.
 *       The file is saved to the quarantine directory, validated for MIME type
 *       integrity, inserted into the database as PENDING, and enqueued for
 *       asynchronous ClamAV scanning.
 *
 *       **Validation pipeline (in order):**
 *       1. JWT authentication
 *       2. Rate limit (20 uploads / 15 min per IP)
 *       3. Extension allowlist check (Multer fileFilter)
 *       4. File size limit (500 MB)
 *       5. **MIME type magic-byte check** — detects renamed dangerous files
 *       6. Belt-and-braces extension re-check in handler
 *
 *       Listen on the Socket.io `scan:complete` / `scan:error` events for
 *       real-time result delivery.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload (max 500 MB)
 *     responses:
 *       202:
 *         description: File accepted and queued for scanning
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *       400:
 *         description: No file attached
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: MissingFile
 *               message: No file was attached. Use multipart/form-data with field name "file".
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       413:
 *         description: File exceeds the 500 MB size limit
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: FileTooLarge
 *               message: File size exceeds the 500 MB limit.
 *       415:
 *         description: File type not allowed or MIME type mismatch detected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               extensionBlocked:
 *                 summary: Extension not on allowlist
 *                 value:
 *                   error: UnsupportedMediaType
 *                   message: File type is not permitted.
 *               mimeMismatch:
 *                 summary: Renamed file detected
 *                 value:
 *                   error: MimeMismatch
 *                   message: MIME mismatch — declared .pdf but detected application/x-msdownload from file magic bytes.
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  authenticate,           // 1. JWT verification
  uploadLimiter,          // 2. Rate limiting
  upload.single('file'),  // 3. Multipart — writes to quarantine dir
  validateMimeType,       // 4. MIME magic-byte validation

  // 5–8. Business logic
  async (req, res, next) => {
    const savedFile = req.file; // populated by multer on success

    try {
      // ── Guard: multer didn't receive a file ──────────────────────────────
      if (!savedFile) {
        return res.status(400).json({
          error:   'MissingFile',
          message: 'No file was attached. Use multipart/form-data with field name "file".',
        });
      }

      // ── Belt-and-braces extension check (in case fileFilter was bypassed) ─
      if (!isAllowedExtension(savedFile.originalname)) {
        fs.unlink(savedFile.path, () => {}); // clean up the written file
        return res.status(415).json({
          error:   'UnsupportedMediaType',
          message: 'File type is not permitted.',
        });
      }

      // ── Log MIME detection result ─────────────────────────────────────────
      if (req.detectedMime) {
        console.log(`[Upload] MIME validated: ${req.detectedMime} for ${savedFile.originalname}`);
      }

      // ── Insert PENDING record into the database ──────────────────────────
      const fileRecord = await repo.create({
        user_id:           req.user.userId,
        original_filename: savedFile.originalname,
      });

      // ── Update the quarantine_path now that we have the file_id ──────────
      await repo.update(fileRecord.file_id, {
        quarantine_path: savedFile.path,
      });

      // ── Enqueue the scan job ──────────────────────────────────────────────
      const job = await enqueueScanJob({
        fileId:         fileRecord.file_id,
        quarantinePath: savedFile.path,
      });

      // ── Respond ──────────────────────────────────────────────────────────
      return res.status(202).json({
        file_id:           fileRecord.file_id,
        status:            fileRecord.status,           // "PENDING"
        original_filename: fileRecord.original_filename,
        job_id:            job.id,
        message:           'File received and queued for scanning.',
      });
    } catch (err) {
      // If DB insert failed, clean up the orphaned file from quarantine
      if (savedFile?.path) {
        fs.unlink(savedFile.path, () => {});
      }
      return next(err);
    }
  }
);

module.exports = router;
