/**
 * api/src/middleware/mimeValidator.js
 *
 * MIME Type Validation Middleware
 * ────────────────────────────────────────────────────────────────────────────
 * Reads the actual magic bytes of the uploaded file (after Multer writes it
 * to disk) and compares them against the declared file extension.
 *
 * This catches the most common attack vector: renaming a dangerous file
 * (e.g. "malware.exe") to an allowed extension (e.g. "report.pdf") to
 * bypass extension-only filters.
 *
 * Runs AFTER multer (file must be on disk to read its bytes) and BEFORE
 * the main upload handler.
 *
 * Allowed extension-to-MIME mapping is explicit and intentionally strict.
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const FileType = require('file-type');

// ── Allowed MIME types per extension ────────────────────────────────────────
// Keys are lowercase extensions (no dot). Values are arrays of accepted MIME
// types reported by the file-type library's magic byte detection.
//
// Extensions with no binary magic bytes (plain text formats) are listed under
// TEXT_ONLY_EXTENSIONS — they are expected to return undefined from FileType.
const MIME_ALLOWLIST = {
  // Documents
  pdf:  ['application/pdf'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/zip'],   // OOXML files are ZIP containers
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/zip'],
  ppt:  ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/zip'],

  // Images
  png:  ['image/png'],
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif:  ['image/gif'],

  // Audio / Video
  mp4:  ['video/mp4'],
  mp3:  ['audio/mpeg'],
  wav:  ['audio/wav', 'audio/x-wav'],

  // Archives
  zip:  ['application/zip'],
  gz:   ['application/gzip'],
  tar:  ['application/x-tar'],
  '7z': ['application/x-7z-compressed'],
};

// Extensions that have NO binary magic bytes — FileType returns undefined for
// these and that is perfectly normal.
const TEXT_ONLY_EXTENSIONS = new Set(['txt', 'csv']);

// ── Helper ────────────────────────────────────────────────────────────────
/**
 * Get the declared (extension-based) category of a filename.
 * @param {string} filename
 * @returns {string} lowercase extension without dot, e.g. "pdf"
 */
function getDeclaredExt(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

// ── Middleware factory ─────────────────────────────────────────────────────
/**
 * Express middleware — validates the MIME type of the uploaded file.
 *
 * Expects `req.file` to be populated by Multer before this middleware runs.
 * On failure it removes the file from disk and calls next(err).
 */
async function validateMimeType(req, res, next) {
  const savedFile = req.file;

  // If there's no file, skip — the upload handler will catch the missing file
  if (!savedFile) {
    return next();
  }

  const declaredExt = getDeclaredExt(savedFile.originalname);

  // Text-only formats — no magic bytes expected, accept without detection
  if (TEXT_ONLY_EXTENSIONS.has(declaredExt)) {
    return next();
  }

  // Detect actual MIME type from file magic bytes
  let detected;
  try {
    detected = await FileType.fromFile(savedFile.path);
  } catch (err) {
    _cleanup(savedFile.path);
    const e       = new Error('Could not read file bytes for MIME validation.');
    e.statusCode  = 422;
    e.code        = 'MimeReadError';
    return next(e);
  }

  // ── Case 1: FileType returned undefined ─────────────────────────────────
  // For binary-declared extensions this means the file has no valid magic
  // bytes — it is either corrupted or masquerading as another type.
  if (!detected) {
    _cleanup(savedFile.path);
    const allowedMimes = MIME_ALLOWLIST[declaredExt] ?? [];
    const e = new Error(
      `MIME mismatch: declared .${declaredExt} but file contains no recognisable magic bytes. ` +
      `Expected one of: ${allowedMimes.join(', ')}`
    );
    e.statusCode = 415;
    e.code       = 'MimeMismatch';
    return next(e);
  }

  // ── Case 2: Extension not in our allowlist ────────────────────────────────
  if (!(declaredExt in MIME_ALLOWLIST)) {
    _cleanup(savedFile.path);
    const e = new Error(`File extension .${declaredExt} is not permitted.`);
    e.statusCode = 415;
    e.code       = 'UnsupportedMediaType';
    return next(e);
  }

  // ── Case 3: Detected MIME not in allowlist for this extension ────────────
  const allowedMimes = MIME_ALLOWLIST[declaredExt];
  if (!allowedMimes.includes(detected.mime)) {
    _cleanup(savedFile.path);
    const e = new Error(
      `MIME mismatch: declared .${declaredExt} (${allowedMimes.join(' | ')}) ` +
      `but detected ${detected.mime} from file magic bytes. ` +
      `This file may have been renamed to bypass type filtering.`
    );
    e.statusCode = 415;
    e.code       = 'MimeMismatch';
    return next(e);
  }

  // All checks passed — attach detected info to req for logging
  req.detectedMime = detected.mime;
  next();
}

// ── Internal ──────────────────────────────────────────────────────────────
function _cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup — log but don't throw
    console.error(`[MimeValidator] Failed to remove ${filePath} after validation failure`);
  }
}

module.exports = { validateMimeType };
