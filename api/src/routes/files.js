/**
 * api/src/routes/files.js
 *
 * File listing and download routes.
 *   GET  /files            — list all files for the authenticated user
 *   GET  /files/:id/download — stream a CLEAN file back to the client
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const { authenticate }   = require('../middleware/auth');
const { db, FileRepository } = require('@secure-upload/shared');

const router = express.Router();
const repo   = new FileRepository(db);

// ── GET /files ─────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const files = await repo.findByUserId(req.user.userId, { limit: 100 });
    return res.json({ files });
  } catch (err) {
    return next(err);
  }
});

// ── GET /files/:fileId/download ────────────────────────────────────────────
router.get('/:fileId/download', authenticate, async (req, res, next) => {
  try {
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

    res.download(file.download_path, file.original_filename);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
