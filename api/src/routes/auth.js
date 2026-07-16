/**
 * api/src/routes/auth.js
 *
 * Production-grade Authentication Routes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Endpoints:
 *   POST /auth/register  — Create a new account
 *   POST /auth/login     — Authenticate and receive access + refresh tokens
 *   POST /auth/refresh   — Exchange a refresh token for a new access token
 *   POST /auth/logout    — Revoke the current refresh token
 *   GET  /auth/me        — Return the currently authenticated user's profile
 *
 * Security measures implemented:
 *   1.  bcrypt (cost 12) — password hashing, never store plain text
 *   2.  Account enumeration prevention — identical error for wrong email/password
 *   3.  Brute-force lockout — account locked for 30 min after 5 failed attempts
 *   4.  Two-token architecture — short-lived access token (15m) + long-lived
 *       refresh token (7d), refresh token hash stored in DB for revocation
 *   5.  Refresh token rotation — every /refresh call issues a new token pair
 *   6.  Strict auth rate limiter — 5 requests / 15 min per IP
 *   7.  Input validation — email format + password complexity enforced
 *   8.  Email normalisation — lowercase + trim before any comparison or storage
 *   9.  Constant-time password comparison — bcrypt.compare() is timing-safe
 *   10. Refresh token transmitted via HttpOnly cookie — not accessible to JS
 *   11. No sensitive data in JWT payload — only userId and email
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const validator = require('validator');

const config          = require('../config');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { db, UserRepository, AuditRepository, ACTIONS } = require('@secure-upload/shared');
const { sendOtpEmail } = require('../utils/mailer');

const router    = express.Router();
const repo      = new UserRepository(db);
const audit     = new AuditRepository(db);

// ── Constants ─────────────────────────────────────────────────────────────────
const COOKIE_NAME    = 'refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,          // not accessible via document.cookie
  secure:   config.env === 'production', // HTTPS only in production
  sameSite: 'strict',      // CSRF mitigation
  maxAge:   7 * 24 * 60 * 60 * 1000,   // 7 days in ms
  path:     '/auth',       // only sent to /auth/* routes
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise an email address — lowercase, trimmed.
 * @param {string} email
 * @returns {string}
 */
function normaliseEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Validate password complexity.
 * Requirements: 8+ chars, uppercase, lowercase, digit, special character.
 * @param {string} password
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character (e.g. !@#$%).' };
  }
  return { valid: true };
}

/**
 * Issue a short-lived access token (15 minutes).
 * Payload is minimal — only what the app needs.
 * @param {{ user_id: string, email: string }} user
 * @returns {string} signed JWT
 */
function issueAccessToken(user) {
  return jwt.sign(
    { userId: user.user_id, email: user.email, role: user.role || 'user' },
    config.jwt.secret,
    { algorithm: config.jwt.algorithm, expiresIn: config.jwt.accessExpiresIn }
  );
}

/**
 * Issue a long-lived refresh token (7 days) and persist its hash to the DB.
 * Returns both the raw token (for cookie) and the expiry date (for DB).
 * @param {string} userId
 * @returns {Promise<{ rawToken: string, expiresAt: Date }>}
 */
async function issueRefreshToken(userId) {
  const rawToken  = crypto.randomBytes(64).toString('hex'); // 128 hex chars, cryptographically random
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await repo.setRefreshToken(userId, tokenHash, expiresAt);
  return { rawToken, expiresAt };
}

// ── POST /auth/register ───────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new account
 *     description: >
 *       Registers a new user with email and password.
 *
 *       **Password requirements:**
 *       - Minimum 8 characters
 *       - At least one uppercase letter
 *       - At least one lowercase letter
 *       - At least one number
 *       - At least one special character
 *
 *       Returns an access token (15 min) and sets an HttpOnly refresh token
 *       cookie (7 days) on success.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Secure#Pass1"
 *               display_name:
 *                 type: string
 *                 example: Jane Smith
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccess'
 *       400:
 *         description: Validation error (bad email, weak password, missing fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: Conflict
 *               message: An account with this email already exists.
 *       429:
 *         description: Too many registration attempts from this IP
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body ?? {};

    // ── Input presence ─────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        error:   'BadRequest',
        message: 'email and password are required.',
      });
    }

    // ── Email format ───────────────────────────────────────────────────────
    const normEmail = normaliseEmail(email);
    if (!validator.isEmail(normEmail)) {
      return res.status(400).json({
        error:   'BadRequest',
        message: 'Please provide a valid email address.',
      });
    }

    // ── Password strength ──────────────────────────────────────────────────
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: 'WeakPassword', message: pwCheck.reason });
    }

    // ── Duplicate email check ──────────────────────────────────────────────
    // Note: we check before hashing to fail fast — the hash is expensive (bcrypt).
    const exists = await repo.emailExists(normEmail);
    if (exists) {
      return res.status(409).json({
        error:   'Conflict',
        message: 'An account with this email already exists.',
      });
    }

    // ── Hash password ──────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptCostFactor);

    // ── Create user ────────────────────────────────────────────────────────
    const user = await repo.create({
      email:        normEmail,
      password_hash: passwordHash,
      display_name:  display_name?.trim() || null,
    });

    // ── Generate and send OTP ──────────────────────────────────────────────
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit string
    const otpHash = await bcrypt.hash(otp, config.auth.bcryptCostFactor);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await repo.setOtp(user.user_id, otpHash, otpExpiresAt);
    
    // Send email asynchronously so we don't block the response
    sendOtpEmail(normEmail, otp).catch(err => {
      console.error(`[Auth] Failed to send OTP to ${normEmail}:`, err);
    });

    console.log(`[Auth] New account registered (OTP sent): ${normEmail} (${user.user_id})`);

    // Audit log
    audit.log({
      userId: user.user_id, action: ACTIONS.USER_REGISTER,
      ip: req.ip, metadata: { email: normEmail },
    }).catch(() => {});

    return res.status(201).json({
      message: 'Account created. Please check your email for the verification code.',
      email: normEmail,
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/verify-otp ────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with OTP
 *     description: >
 *       Verifies the 6-digit OTP sent to the user's email during registration.
 *       Upon success, the email is marked as verified. The user must then log in.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Missing fields or invalid OTP format
 *       401:
 *         description: Invalid or expired OTP
 */
router.post('/verify-otp', authLimiter, async (req, res, next) => {
  try {
    const { email, otp } = req.body ?? {};

    if (!email || !otp) {
      return res.status(400).json({ error: 'BadRequest', message: 'Email and OTP are required.' });
    }

    const normEmail = normaliseEmail(email);
    const user = await repo.findByEmailForAuth(normEmail);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or OTP.' });
    }

    if (user.email_verified) {
      return res.json({ message: 'Email is already verified. You may log in.' });
    }

    if (!user.otp_hash || !user.otp_expires_at || new Date(user.otp_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unauthorized', message: 'OTP has expired or is invalid.' });
    }

    const otpMatches = await bcrypt.compare(otp, user.otp_hash);
    if (!otpMatches) {
      // We could add lockout for OTP here, but keeping it simple for now
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid OTP.' });
    }

    await repo.markEmailVerified(user.user_id);
    console.log(`[Auth] Email verified: ${normEmail}`);

    return res.json({ message: 'Email verified successfully. You may now log in.' });
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     description: >
 *       Authenticates a user and issues a short-lived access token (15 min)
 *       plus a long-lived HttpOnly refresh token cookie (7 days).
 *
 *       **Security:** Returns the same error message whether the email
 *       does not exist or the password is incorrect — preventing account
 *       enumeration. The account is locked for 30 minutes after 5 consecutive
 *       failed attempts.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccess'
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials or account locked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidCredentials:
 *                 value:
 *                   error: Unauthorized
 *                   message: Invalid email or password.
 *               accountLocked:
 *                 value:
 *                   error: AccountLocked
 *                   message: Account temporarily locked due to multiple failed login attempts. Try again in 30 minutes.
 *       429:
 *         description: Too many login attempts from this IP
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    // ── Input presence ─────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        error:   'BadRequest',
        message: 'email and password are required.',
      });
    }

    const normEmail = normaliseEmail(email);

    // ── Look up user (with password_hash for comparison) ───────────────────
    const user = await repo.findByEmailForAuth(normEmail);

    // ── Account enumeration prevention ─────────────────────────────────────
    // If user doesn't exist, run a dummy bcrypt compare to consume the same
    // amount of time as a real comparison — prevents timing-based user enumeration.
    if (!user) {
      await bcrypt.compare(password, '$2a$12$dummyhashtopreventtimingattacksonnonexistentaccounts...');
      return res.status(401).json({
        error:   'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    // ── Account lockout check ──────────────────────────────────────────────
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockMinutes = Math.ceil(config.auth.lockDurationMs / 60000);
      return res.status(401).json({
        error:   'AccountLocked',
        message: `Account temporarily locked due to multiple failed login attempts. Try again in ${lockMinutes} minute${lockMinutes === 1 ? '' : 's'}.`,
        locked_until: user.locked_until,
      });
    }

    // ── Email verification check ───────────────────────────────────────────
    if (!user.email_verified) {
      return res.status(401).json({
        error:   'EmailNotVerified',
        message: 'Please verify your email address before logging in.',
      });
    }

    // ── Password verification (constant-time via bcrypt) ───────────────────
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      // Record failure — may trigger lockout if threshold reached
      await repo.recordFailedLogin(user.user_id, config.auth.maxLoginAttempts);
      console.warn(`[Auth] Failed login attempt for: ${normEmail}`);

      return res.status(401).json({
        error:   'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    // ── Success: reset counter, issue tokens ───────────────────────────────
    await repo.recordSuccessfulLogin(user.user_id);
    console.log(`[Auth] Successful login: ${normEmail} (${user.user_id})`);

    // Audit log
    audit.log({
      userId: user.user_id, action: ACTIONS.USER_LOGIN,
      ip: req.ip, metadata: { email: normEmail },
    }).catch(() => {});

    const accessToken             = issueAccessToken(user);
    const { rawToken, expiresAt } = await issueRefreshToken(user.user_id);

    res.cookie(COOKIE_NAME, rawToken, { ...COOKIE_OPTIONS, expires: expiresAt });

    return res.json({
      access_token: accessToken,
      token_type:   'Bearer',
      expires_in:   15 * 60,
      user: {
        userId:       user.user_id,
        email:        user.email,
        display_name: user.display_name,
        role:         user.role || 'user',
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh the access token
 *     description: >
 *       Exchanges a valid refresh token (from the HttpOnly cookie) for a
 *       new access token and rotates the refresh token.
 *
 *       **Token rotation:** every call to this endpoint invalidates the
 *       old refresh token and issues a new one — limiting the damage
 *       from a stolen refresh token.
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token: { type: string }
 *                 token_type:   { type: string, example: Bearer }
 *                 expires_in:   { type: number, example: 900 }
 *       401:
 *         description: Missing, invalid, or expired refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[COOKIE_NAME];

    if (!rawToken) {
      return res.status(401).json({
        error:   'Unauthorized',
        message: 'Refresh token is missing.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Look up the user by token hash
    const user = await repo.findByRefreshTokenHash(tokenHash);

    if (!user) {
      return res.status(401).json({
        error:   'Unauthorized',
        message: 'Refresh token is invalid or has been revoked.',
      });
    }

    // Check expiry
    if (!user.refresh_token_expires_at || new Date(user.refresh_token_expires_at) < new Date()) {
      await repo.revokeRefreshToken(user.user_id);
      res.clearCookie(COOKIE_NAME, { path: '/auth' });
      return res.status(401).json({
        error:   'Unauthorized',
        message: 'Refresh token has expired. Please log in again.',
      });
    }

    // ── Rotate: issue new access + refresh token pair ──────────────────────
    const accessToken             = issueAccessToken(user);
    const { rawToken: newRaw, expiresAt } = await issueRefreshToken(user.user_id);

    res.cookie(COOKIE_NAME, newRaw, { ...COOKIE_OPTIONS, expires: expiresAt });

    return res.json({
      access_token: accessToken,
      token_type:   'Bearer',
      expires_in:   15 * 60,
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and revoke the refresh token
 *     description: >
 *       Revokes the current refresh token on the server and clears the
 *       HttpOnly cookie. The access token remains valid until its 15-minute
 *       natural expiry — this is by design (stateless JWTs).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await repo.revokeRefreshToken(req.user.userId);
    res.clearCookie(COOKIE_NAME, { path: '/auth' });
    audit.log({ userId: req.user.userId, action: ACTIONS.USER_LOGOUT, ip: req.ip }).catch(() => {});
    console.log(`[Auth] Logout: ${req.user.email} (${req.user.userId})`);
    return res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    return next(err);
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current user's profile
 *     description: Returns the authenticated user's public profile fields.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:       { type: string, format: uuid }
 *                     email:        { type: string }
 *                     display_name: { type: string }
 *                     last_login_at: { type: string, format: date-time }
 *                     created_at:   { type: string, format: date-time }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await repo.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    }
    return res.json({
      user: {
        userId:         user.user_id,
        email:          user.email,
        display_name:   user.display_name,
        email_verified: user.email_verified,
        role:           user.role || 'user',
        last_login_at:  user.last_login_at,
        created_at:     user.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
