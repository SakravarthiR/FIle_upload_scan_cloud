/**
 * Migration: 20240106000000_add_role_to_users.js
 *
 * Adds a `role` column to the users table for Role-Based Access Control (RBAC).
 * Roles: 'user' (default) | 'admin'
 */

'use strict';

const TABLE = 'users';

exports.up = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table
      .varchar('role', 20)
      .notNullable()
      .defaultTo('user')
      .comment('RBAC role: user | admin');
  });

  await knex.raw(`
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin'))
  `);
};

exports.down = async function (knex) {
  await knex.schema.table(TABLE, (table) => {
    table.dropColumn('role');
  });
};
