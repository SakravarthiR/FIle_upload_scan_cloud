/**
 * Migration: 20240104000000_create_audit_logs_table.js
 *
 * Creates the `audit_logs` table.
 * Every significant system event is recorded here — uploads, scans,
 * logins, downloads, permission denials, etc.
 *
 * Design decisions:
 *   - append-only: rows are never updated or deleted
 *   - ip_address stored for forensic analysis
 *   - metadata JSONB for flexible, event-specific data
 *   - indexed by user_id, action, and created_at for efficient queries
 */

'use strict';

const TABLE = 'audit_logs';

exports.up = async function (knex) {
  await knex.schema.createTable(TABLE, (table) => {
    table
      .bigIncrements('id')
      .comment('Auto-increment primary key');

    table
      .uuid('user_id')
      .nullable()
      .index()
      .comment('User who triggered the event; null for system/unauthenticated events');

    table
      .varchar('action', 80)
      .notNullable()
      .index()
      .comment('Event type, e.g. USER_REGISTER, USER_LOGIN, FILE_UPLOAD, SCAN_CLEAN');

    table
      .text('resource_type')
      .nullable()
      .comment('Type of resource acted upon, e.g. file, user');

    table
      .text('resource_id')
      .nullable()
      .comment('ID of the resource, e.g. file_id or user_id');

    table
      .varchar('ip_address', 45)   // 45 chars covers IPv6
      .nullable()
      .comment('Client IP address at time of event');

    table
      .text('user_agent')
      .nullable()
      .comment('Client User-Agent header');

    table
      .jsonb('metadata')
      .nullable()
      .defaultTo('{}')
      .comment('Arbitrary event-specific data (filename, virus_name, etc.)');

    table
      .varchar('outcome', 20)
      .notNullable()
      .defaultTo('SUCCESS')
      .comment('SUCCESS | FAILURE | BLOCKED');

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .index()
      .comment('When the event occurred');
  });

  // Composite index for querying a user's recent actions
  await knex.schema.table(TABLE, (table) => {
    table.index(['user_id', 'created_at'], 'idx_audit_user_time');
    table.index(['action',  'created_at'], 'idx_audit_action_time');
  });

  // Enforce outcome check constraint
  await knex.raw(`
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT audit_outcome_check
    CHECK (outcome IN ('SUCCESS', 'FAILURE', 'BLOCKED'))
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists(TABLE);
};
