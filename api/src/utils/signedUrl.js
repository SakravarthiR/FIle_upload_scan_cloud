/**
 * api/src/utils/signedUrl.js
 *
 * HMAC-SHA256 signed download URL generation and verification.
 *
 * Security properties:
 *   - URL contains: fileId, userId, expiry timestamp
 *   - Signed with a server-side secret — cannot be forged
 *   - Time-limited (default 15 minutes)
 *   - Bound to a specific user — another user's token won't work
 *   - Query-token approach so it works in <a href> and <iframe> without JS
 */

'use strict';

const crypto = require('crypto');
const config = require('../config');

const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || config.jwt.secret + '_signed_url';
const DEFAULT_TTL_MS    = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a signed download URL for a file.
 *
 * @param {object} params
 * @param {string}  params.fileId   - UUID of the file
 * @param {string}  params.userId   - UUID of the owning user
 * @param {string}  params.baseUrl  - Base API URL, e.g. http://localhost:3000
 * @param {number} [params.ttlMs]   - Token lifetime in ms (default 15 min)
 * @returns {string} Full signed download URL
 */
function generateSignedUrl({ fileId, userId, baseUrl, ttlMs = DEFAULT_TTL_MS }) {
  const expiresAt = Date.now() + ttlMs;
  const payload   = `${fileId}:${userId}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', SIGNED_URL_SECRET)
    .update(payload)
    .digest('hex');

  const params = new URLSearchParams({ sig: signature, exp: String(expiresAt) });
  return `${baseUrl}/files/${fileId}/download?${params.toString()}`;
}

/**
 * Verify a signed download token from query params.
 *
 * @param {object} params
 * @param {string} params.fileId    - UUID from the URL path
 * @param {string} params.userId    - UUID from the JWT (authenticated user)
 * @param {string} params.sig       - HMAC signature from query string
 * @param {string} params.exp       - Expiry timestamp from query string
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifySignedUrl({ fileId, userId, sig, exp }) {
  if (!sig || !exp) {
    return { valid: false, reason: 'Missing signature parameters.' };
  }

  // Check expiry first (fast path, no crypto needed)
  const expiresAt = Number(exp);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return { valid: false, reason: 'Download link has expired. Please request a new one.' };
  }

  // Recompute expected signature and compare in constant time
  const payload  = `${fileId}:${userId}:${exp}`;
  const expected = crypto
    .createHmac('sha256', SIGNED_URL_SECRET)
    .update(payload)
    .digest('hex');

  const sigBuf      = Buffer.from(sig,      'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  // Constant-time comparison — prevents timing attacks
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid or tampered download signature.' };
  }

  return { valid: true };
}

module.exports = { generateSignedUrl, verifySignedUrl };
