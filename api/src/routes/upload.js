/**
 * routes/upload.js
 *
 * POST /upload
 * ─────────────────────────────────────────────────────────────────
 * Pipeline:
 *   1. [Middleware] authenticate   — verify Bearer JWT, attach req.user
 *   2. [Middleware] uploadLimiter  — 20 uploads / 15 min per IP
 *   3. [Middleware] multer         — stream file to quarantine dir
 *   4. [Handler]   extension check — reject disallowed types (belt + braces)
 *   5. [Handler]   SHA-256 hash    — computed from the saved file stream
 *   6. [Handler]   DB insert       — creates a PENDING row in `files`
 *   7. [Handler]   response        — returns { file_id, status, original_filename }
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const express        = require('express');
const fs             = require('fs');
const { authenticate }   = require('../middleware/auth');
const { uploadLimiter }  = require('../middleware/rateLimiter');
const { upload }         = require('../utils/multerConfig');
const { sha256OfFile, isAllowedExtension } = require('../utils/fileHelpers');
const { db, FileRepository, enqueueScanJob } = require('@secure-upload/shared');

const router = express.Router();
const repo   = new FileRepository(db);

// ── POST /upload ───────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,          // 1. JWT verification
  uploadLimiter,         // 2. Rate limiting
  upload.single('file'), // 3. Multipart — writes to quarantine dir

  // 4–7. Business logic
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

      // ── Insert PENDING record into the database ──────────────────────────
      const fileRecord = await repo.create({
        user_id:           req.user.userId,
        original_filename: savedFile.originalname,
      });

      // ── Update the quarantine_path now that we have the file_id ──────────
      // (The path was already written by multer using a UUID name — just persist it)
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
