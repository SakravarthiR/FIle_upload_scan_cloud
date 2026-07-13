/**
 * utils/fileHelpers.js
 *
 * Pure utility functions for file handling:
 *   - Computing SHA-256 hash of a file on disk
 *   - Extracting and validating the file extension
 *   - Ensuring the quarantine directory exists at startup
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const config = require('../config');

/**
 * Compute the SHA-256 hex digest of a file by streaming it.
 * Never loads the whole file into memory.
 *
 * @param {string} filePath  Absolute path to the file
 * @returns {Promise<string>} 64-char lowercase hex string
 */
function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data',  (chunk) => hash.update(chunk));
    stream.on('end',   () => resolve(hash.digest('hex')));
  });
}

/**
 * Extract the lowercase extension from a filename (without the dot).
 * Returns empty string if no extension is present.
 *
 * @param {string} filename
 * @returns {string}  e.g. "pdf", "docx", ""
 */
function getExtension(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

/**
 * Return true if the file extension is on the allowlist.
 *
 * @param {string} filename
 * @returns {boolean}
 */
function isAllowedExtension(filename) {
  const ext = getExtension(filename);
  return ext.length > 0 && config.upload.allowedExtensions.has(ext);
}

/**
 * Ensure the quarantine directory exists (creates it recursively if needed).
 * Call this once at server startup before accepting any requests.
 */
function ensureQuarantineDir() {
  fs.mkdirSync(config.upload.quarantineDir, { recursive: true });
}

module.exports = {
  sha256OfFile,
  getExtension,
  isAllowedExtension,
  ensureQuarantineDir,
};
