/**
 * Migration: 20240103000000_add_otp_to_users.js
 *
 * Adds columns to the `users` table for email OTP verification.
 */

'use strict';

const TABLE = 'users';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table
      .text('otp_hash')
      .nullable()
      .comment('Hash of the 6-digit OTP for email verification');

    table
      .timestamp('otp_expires_at', { useTz: true })
      .nullable()
      .comment('When the OTP expires (usually 10 mins after generation)');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table.dropColumn('otp_hash');
    table.dropColumn('otp_expires_at');
  });
};
