/**
 * api/src/config.js
 *
 * Single source of truth for all API configuration.
 * Everything is read from environment variables with
 * safe, documented defaults for local development.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ── Helpers ────────────────────────────────────────────────────────────────
const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
};

const optional = (key, defaultValue) => process.env[key] ?? defaultValue;

// ── Config object ──────────────────────────────────────────────────────────
const config = {
  env:  optional('NODE_ENV', 'development'),
  port: Number(optional('API_PORT', '3000')),

  // JWT — access token (short-lived) + refresh token (long-lived)
  jwt: {
    secret:              optional('JWT_SECRET',         'dev-access-secret-change-in-production'),
    refreshSecret:       optional('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
    algorithm:           'HS256',
    accessExpiresIn:     optional('JWT_ACCESS_EXPIRES',  '15m'),   // 15 minutes
    refreshExpiresIn:    optional('JWT_REFRESH_EXPIRES', '7d'),    // 7 days
  },

  // Authentication policy
  auth: {
    bcryptCostFactor:  Number(optional('BCRYPT_COST', '12')),
    maxLoginAttempts:  Number(optional('MAX_LOGIN_ATTEMPTS', '5')),  // lock after N failures
    lockDurationMs:    Number(optional('LOCK_DURATION_MS', String(30 * 60 * 1000))), // 30 min
  },

  // Email config for OTP
  email: {
    host: optional('SMTP_HOST', ''),
    port: Number(optional('SMTP_PORT', '587')),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
  },

  // Upload constraints
  upload: {
    // Maximum file size in bytes — 500 MB
    maxFileSizeBytes: Number(optional('MAX_FILE_SIZE_BYTES', String(500 * 1024 * 1024))),

    // Allowlisted extensions (lowercase, without leading dot)
    allowedExtensions: new Set(
      optional(
        'ALLOWED_EXTENSIONS',
        'pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,zip,tar,gz,7z,png,jpg,jpeg,gif,mp4,mp3,wav'
      )
        .split(',')
        .map((e) => e.trim().toLowerCase())
    ),

    // Where multer writes the raw file before scanning
    quarantineDir: (() => {
      const p = optional('QUARANTINE_DIR', require('path').resolve(__dirname, '../../quarantine'));
      return require('path').isAbsolute(p) ? p : require('path').resolve(__dirname, '../..', p);
    })(),
  },

  // Rate limiting
  rateLimit: {
    windowMs:  Number(optional('RATE_LIMIT_WINDOW_MS', String(15 * 60 * 1000))), // 15 min
    max:       Number(optional('RATE_LIMIT_MAX',        '20')),                   // requests per window
  },

  // DB (consumed by shared/connection.js via process.env — kept here for reference)
  db: {
    host:     optional('DB_HOST',     'localhost'),
    port:     Number(optional('DB_PORT', '5432')),
    name:     optional('DB_NAME',     'secure_upload'),
    user:     optional('DB_USER',     'postgres'),
    password: optional('DB_PASSWORD', ''),
  },
};

module.exports = config;
