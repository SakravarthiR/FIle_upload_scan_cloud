/**
 * middleware/rateLimiter.js
 *
 * Three limiters:
 *   authLimiter   — very tight limit on /auth endpoints (5 req / 15 min per IP)
 *   uploadLimiter — tight limit on the /upload endpoint (20 req / 15 min per IP)
 *   globalLimiter — loose catch-all on every API route (200 req / 15 min per IP)
 */

'use strict';

const rateLimit = require('express-rate-limit');
const config    = require('../config');

const { windowMs, max } = config.rateLimit;

/**
 * Very strict limiter on auth endpoints.
 * Protects against credential stuffing and brute-force login attacks.
 * 5 requests per 15 minutes per IP — intentionally low.
 */
const authLimiter = rateLimit({
  windowMs,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  skipSuccessfulRequests: false, // count ALL requests, including successful logins
  handler: (_req, res) => {
    res.status(429).json({
      error:   'TooManyRequests',
      message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
      retryAfter: Math.ceil(windowMs / 1000),
    });
  },
});

/**
 * Tight limiter applied specifically to POST /upload.
 */
const uploadLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  handler: (_req, res) => {
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
  handler: (_req, res) => {
    res.status(429).json({
      error:   'TooManyRequests',
      message: 'Too many requests, please slow down.',
    });
  },
});

module.exports = { authLimiter, uploadLimiter, globalLimiter };
