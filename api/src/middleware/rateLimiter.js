/**
 * middleware/rateLimiter.js
 *
 * Two limiters:
 *   uploadLimiter — tight limit on the /upload endpoint (20 req / 15 min per IP)
 *   globalLimiter — loose catch-all on every API route (200 req / 15 min per IP)
 */

'use strict';

const rateLimit = require('express-rate-limit');
const config    = require('../config');

const { windowMs, max } = config.rateLimit;

/**
 * Tight limiter applied specifically to POST /upload.
 * Returns RFC-7807-style JSON on 429.
 */
const uploadLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: 'draft-7', // RateLimit-* headers (RFC 6585 + draft 7)
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error:   'TooManyRequests',
      message: `Upload limit exceeded. You may upload at most ${max} files every ${windowMs / 60_000} minutes.`,
      retryAfter: Math.ceil(windowMs / 1000),
    });
  },
});

/**
 * Loose global limiter applied to all routes.
 */
const globalLimiter = rateLimit({
  windowMs,
  max:    200,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  handler: (req, res) => {
    res.status(429).json({
      error:   'TooManyRequests',
      message: 'Too many requests, please slow down.',
    });
  },
});

module.exports = { uploadLimiter, globalLimiter };
