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

/**
 * @openapi
 * /status/{fileId}:
 *   get:
 *     tags: [Status]
 *     summary: Get scan status for a file
 *     description: >
 *       Returns the full scan record for a file owned by the authenticated user.
 *       Poll this endpoint or listen on Socket.io `scan:complete` for real-time updates.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the file record
 *         example: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *     responses:
 *       200:
 *         description: File scan record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FileRecord'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
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
