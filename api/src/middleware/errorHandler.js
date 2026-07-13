/**
 * middleware/errorHandler.js
 *
 * Centralised Express error handler (must have 4 parameters).
 * Catches anything passed via next(err) and sends a clean JSON response.
 * Multer errors are intercepted here so they get proper HTTP status codes.
 */

'use strict';

const multer = require('multer');
const config = require('../config');

/**
 * @param {Error} err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, req, res, next) {
  // ── Multer-specific errors ─────────────────────────────────────────────
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error:   'FileTooLarge',
        message: `File exceeds the maximum allowed size of ${config.upload.maxFileSizeBytes / (1024 * 1024)} MB.`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error:   'UnexpectedField',
        message: 'Unexpected form field. Use field name "file" for the upload.',
      });
    }
    return res.status(400).json({ error: 'UploadError', message: err.message });
  }

  // ── Custom application errors with an explicit status ─────────────────
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error:   err.code || 'ApplicationError',
      message: err.message,
    });
  }

  // ── Unhandled / unexpected errors ─────────────────────────────────────
  const isDev = config.env === 'development';
  console.error('[ErrorHandler]', err);

  return res.status(500).json({
    error:   'InternalServerError',
    message: isDev ? err.message : 'An unexpected error occurred.',
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
