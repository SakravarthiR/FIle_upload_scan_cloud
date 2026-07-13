/**
 * utils/multerConfig.js
 *
 * Configures Multer for receiving the raw file upload.
 * The file is written directly to the quarantine directory with a UUID
 * filename so the original name never touches the filesystem.
 *
 * Validation order (Multer fires these before the route handler):
 *   1. fileFilter  — extension allowlist check
 *   2. limits.fileSize — 500 MB cap (Multer stops streaming on breach)
 *
 * The route handler then computes the SHA-256 after the write completes.
 */

'use strict';

const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 }        = require('uuid');
const { isAllowedExtension } = require('./fileHelpers');
const config = require('../config');

// ── Storage: quarantine dir, UUID-based filename ───────────────────────────
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, config.upload.quarantineDir);
  },

  filename(_req, file, cb) {
    // Store as <uuid>.<original-ext> — never use the original name on disk
    const ext      = path.extname(file.originalname).toLowerCase(); // e.g. ".pdf"
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

// ── Extension allowlist ────────────────────────────────────────────────────
function fileFilter(_req, file, cb) {
  if (!isAllowedExtension(file.originalname)) {
    // Returning an Error causes Multer to call next(err) with a MulterError-like object
    // We attach a flag so errorHandler.js can distinguish this from other errors
    const err       = new Error(
      `File type not allowed. Permitted extensions: ${[...config.upload.allowedExtensions].join(', ')}`
    );
    err.statusCode  = 415;
    err.code        = 'UnsupportedMediaType';
    return cb(err, false);
  }
  cb(null, true);
}

// ── Multer instance ────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeBytes, // 500 MB — multer enforces this while streaming
    files:    1,                               // one file per request
    fields:   5,                               // allow a small number of text fields
  },
});

module.exports = { upload };
