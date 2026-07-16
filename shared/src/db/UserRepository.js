/**
 * shared/src/db/UserRepository.js
 *
 * Data-access layer for the `users` table.
 *
 * All methods are async and return plain objects (not Knex row objects).
 * The repository never returns the password_hash or refresh_token_hash
 * to callers — use the dedicated methods that need them explicitly.
 */

'use strict';

const TABLE = 'users';

// Columns safe to return to application code (never return password_hash externally)
const PUBLIC_COLUMNS = [
  'user_id',
  'email',
  'display_name',
  'email_verified',
  'failed_login_attempts',
  'locked_until',
  'last_login_at',
  'created_at',
  'updated_at',
];

class UserRepository {
  /**
   * @param {import('knex').Knex} knex
   */
  constructor(knex) {
    this._db = knex;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  /**
   * Insert a new user record.
   *
   * @param {{ email: string, password_hash: string, display_name?: string }} data
   * @returns {Promise<object>} Created user (public columns only)
   */
  async create({ email, password_hash, display_name = null }) {
    const [user] = await this._db(TABLE)
      .insert({ email, password_hash, display_name })
      .returning(PUBLIC_COLUMNS);
    return user;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Find a user by their UUID (public columns only).
   * Returns null if not found.
   *
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findById(userId) {
    const user = await this._db(TABLE)
      .where({ user_id: userId })
      .select(PUBLIC_COLUMNS)
      .first();
    return user ?? null;
  }

  /**
   * Find a user by email including the password_hash and OTP details for authentication.
   * ONLY call this during login or OTP verification.
   *
   * @param {string} email  Normalised (lowercase) email
   * @returns {Promise<object|null>}
   */
  async findByEmailForAuth(email) {
    const user = await this._db(TABLE)
      .where({ email })
      .select([
        ...PUBLIC_COLUMNS,
        'password_hash',
        'refresh_token_hash',
        'refresh_token_expires_at',
        'otp_hash',
        'otp_expires_at',
      ])
      .first();
    return user ?? null;
  }

  /**
   * Check whether an email is already registered.
   *
   * @param {string} email  Normalised email
   * @returns {Promise<boolean>}
   */
  async emailExists(email) {
    const row = await this._db(TABLE)
      .where({ email })
      .select('user_id')
      .first();
    return !!row;
  }

  // ── Lockout management ──────────────────────────────────────────────────────

  /**
   * Increment the failed_login_attempts counter.
   * If attempts reach the threshold, set locked_until to 30 minutes from now.
   *
   * @param {string} userId
   * @param {number} maxAttempts  Lock after this many consecutive failures
   */
  async recordFailedLogin(userId, maxAttempts = 5) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .increment('failed_login_attempts', 1);

    // Re-read to check if we just crossed the threshold
    const row = await this._db(TABLE)
      .where({ user_id: userId })
      .select('failed_login_attempts')
      .first();

    if (row && row.failed_login_attempts >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // +30 min
      await this._db(TABLE)
        .where({ user_id: userId })
        .update({ locked_until: lockedUntil });
    }
  }

  /**
   * Reset failed attempts and lockout on successful login.
   * Also updates last_login_at.
   *
   * @param {string} userId
   */
  async recordSuccessfulLogin(userId) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .update({
        failed_login_attempts: 0,
        locked_until:          null,
        last_login_at:         new Date(),
      });
  }

  // ── Refresh token management ────────────────────────────────────────────────

  /**
   * Store the SHA-256 hash of a new refresh token.
   *
   * @param {string} userId
   * @param {string} tokenHash   SHA-256 hex of the raw refresh token
   * @param {Date}   expiresAt   Expiry date
   */
  async setRefreshToken(userId, tokenHash, expiresAt) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .update({
        refresh_token_hash:       tokenHash,
        refresh_token_expires_at: expiresAt,
      });
  }

  /**
   * Find a user by their refresh token hash (for token rotation).
   *
   * @param {string} tokenHash  SHA-256 hex of the raw refresh token
   * @returns {Promise<object|null>}
   */
  async findByRefreshTokenHash(tokenHash) {
    const user = await this._db(TABLE)
      .where({ refresh_token_hash: tokenHash })
      .select([...PUBLIC_COLUMNS, 'refresh_token_hash', 'refresh_token_expires_at'])
      .first();
    return user ?? null;
  }

  /**
   * Revoke the refresh token (logout / token rotation cleanup).
   *
   * @param {string} userId
   */
  async revokeRefreshToken(userId) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .update({
        refresh_token_hash:       null,
        refresh_token_expires_at: null,
      });
  }

  // ── OTP management ────────────────────────────────────────────────────────

  /**
   * Store the hash of an OTP for a user.
   *
   * @param {string} userId
   * @param {string} otpHash     bcrypt hash of the OTP
   * @param {Date}   expiresAt   Expiry date
   */
  async setOtp(userId, otpHash, expiresAt) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .update({
        otp_hash:       otpHash,
        otp_expires_at: expiresAt,
      });
  }

  /**
   * Mark user's email as verified and clear the OTP fields.
   *
   * @param {string} userId
   */
  async markEmailVerified(userId) {
    await this._db(TABLE)
      .where({ user_id: userId })
      .update({
        email_verified: true,
        otp_hash:       null,
        otp_expires_at: null,
      });
  }
}

module.exports = UserRepository;
