/**
 * Migration: 20240102000000_create_users_table.js
 *
 * Creates the `users` table for real authentication.
 *
 * Security design decisions:
 *   - password_hash: bcrypt hash only — plain-text password is never stored
 *   - email: unique, lowercase-normalised at application layer before insert
 *   - failed_login_attempts: brute-force lockout counter
 *   - locked_until: account is locked until this timestamp (NULL = not locked)
 *   - email_verified: prepared for future email-verification flow
 *   - refresh_token_hash: SHA-256 of the refresh token (allows server-side revocation)
 *   - last_login_at: audit trail
 */

'use strict';

const TABLE = 'users';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable(TABLE, (table) => {
    // ── Primary key ─────────────────────────────────────────────────────────
    table
      .uuid('user_id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'))
      .comment('Unique user identifier');

    // ── Identity ────────────────────────────────────────────────────────────
    table
      .text('email')
      .notNullable()
      .unique()
      .comment('Normalised (lowercase) email address — unique per user');

    table
      .text('password_hash')
      .notNullable()
      .comment('bcrypt hash of the user password (cost factor 12)');

    table
      .text('display_name')
      .nullable()
      .comment('Optional display name — shown in the UI');

    // ── Email verification ───────────────────────────────────────────────────
    table
      .boolean('email_verified')
      .notNullable()
      .defaultTo(false)
      .comment('True once the user has verified their email address');

    // ── Brute-force lockout ──────────────────────────────────────────────────
    table
      .integer('failed_login_attempts')
      .notNullable()
      .defaultTo(0)
      .comment('Consecutive failed login attempts since last success');

    table
      .timestamp('locked_until', { useTz: true })
      .nullable()
      .comment('Account locked until this UTC timestamp; NULL = not locked');

    // ── Refresh token ────────────────────────────────────────────────────────
    table
      .text('refresh_token_hash')
      .nullable()
      .comment('SHA-256 hex of the current refresh token; NULL = logged out');

    table
      .timestamp('refresh_token_expires_at', { useTz: true })
      .nullable()
      .comment('Expiry timestamp of the current refresh token');

    // ── Audit ────────────────────────────────────────────────────────────────
    table
      .timestamp('last_login_at', { useTz: true })
      .nullable()
      .comment('UTC timestamp of the most recent successful login');

    // ── Standard timestamps ──────────────────────────────────────────────────
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Account creation timestamp');

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Last-updated — maintained via trigger');
  });

  // ── Auto-update `updated_at` trigger ───────────────────────────────────────
  // Reuses the set_updated_at() function created by the files migration.
  await knex.raw(`
    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON ${TABLE}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  // ── Extra indexes ─────────────────────────────────────────────────────────
  await knex.schema.table(TABLE, (table) => {
    table.index('email',          'idx_users_email');
    table.index('locked_until',   'idx_users_locked_until');
    table.index('created_at',     'idx_users_created_at');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS users_set_updated_at ON ${TABLE}`);
  await knex.schema.dropTableIfExists(TABLE);
};
