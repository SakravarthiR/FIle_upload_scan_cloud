/**
 * routes/status.js
 *
 * GET /status/:fileId
 * Returns the current scan status of a file owned by the authenticated user.
 */

'use strict';

const express            = require('express');
const { authenticate }   = require('../middleware/auth');
const { db, FileRepository } = require('@secure-upload/shared');

const router = express.Router();
const repo   = new FileRepository(db);

router.get('/:fileId', authenticate, async (req, res, next) => {
  try {
    const file = await repo.findById(req.params.fileId);

    if (!file) {
      return res.status(404).json({ error: 'NotFound', message: 'File record not found.' });
    }

    // Users may only query their own files
    if (file.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied.' });
    }

    return res.json({
      file_id:           file.file_id,
      status:            file.status,
      original_filename: file.original_filename,
      sha256_hash:       file.sha256_hash,
      virus_name:        file.virus_name,
      scan_time:         file.scan_time,
      scanner_version:   file.scanner_version,
      download_path:     file.download_path,
      created_at:        file.created_at,
      updated_at:        file.updated_at,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
