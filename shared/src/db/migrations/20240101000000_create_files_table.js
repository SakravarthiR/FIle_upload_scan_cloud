/**
 * Migration: 20240101000000_create_files_table.js
 *
 * Creates the `files` table for tracking uploaded file metadata,
 * scan status, and quarantine/download paths.
 *
 * Status lifecycle:
 *   PENDING   → File received, queued for scanning
 *   CLEAN     → Scan completed, no threats found
 *   INFECTED  → Scan completed, virus/malware detected
 *   ERROR     → Scan pipeline encountered an unrecoverable error
 *   UNKNOWN   → Scanner returned an inconclusive result
 */

'use strict';

const TABLE = 'files';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  // Ensure the uuid-ossp extension is available for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable(TABLE, (table) => {
    // ── Primary key ──────────────────────────────────────────────────────────
    table
      .uuid('file_id')
      .primary()
      .defaultTo(knex.raw('uuid_generate_v4()'))
      .comment('Unique identifier for the uploaded file record');

    // ── Ownership ────────────────────────────────────────────────────────────
    table
      .uuid('user_id')
      .notNullable()
      .index()
      .comment('ID of the user who uploaded the file');

    // ── File metadata ────────────────────────────────────────────────────────
    table
      .text('original_filename')
      .notNullable()
      .comment('Original filename as provided by the client');

    table
      .varchar('status', 20)
      .notNullable()
      .defaultTo('PENDING')
      .comment('Scan status: PENDING | CLEAN | INFECTED | ERROR | UNKNOWN');

    table
      .varchar('sha256_hash', 64)
      .nullable()
      .comment('SHA-256 hex digest of the raw file bytes');

    // ── Scan result ──────────────────────────────────────────────────────────
    table
      .text('virus_name')
      .nullable()
      .comment('Virus/threat signature name reported by ClamAV (null if CLEAN)');

    table
      .timestamp('scan_time', { useTz: true })
      .nullable()
      .comment('UTC timestamp when the scan was completed');

    table
      .varchar('scanner_version', 100)
      .nullable()
      .comment('ClamAV engine + definition version string at scan time');

    // ── Storage paths ────────────────────────────────────────────────────────
    table
      .text('download_path')
      .nullable()
      .comment('Relative or absolute path to the clean file available for download');

    table
      .text('quarantine_path')
      .nullable()
      .comment('Path to the quarantined file when status = INFECTED');

    // ── Timestamps ───────────────────────────────────────────────────────────
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Record creation timestamp');

    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
      .comment('Record last-updated timestamp — kept current via trigger');
  });

  // ── Add CHECK constraint for status enum ───────────────────────────────────
  await knex.raw(`
    ALTER TABLE ${TABLE}
    ADD CONSTRAINT files_status_check
    CHECK (status IN ('PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'UNKNOWN'))
  `);

  // ── Auto-update `updated_at` via PostgreSQL trigger ───────────────────────
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER files_set_updated_at
    BEFORE UPDATE ON ${TABLE}
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);

  // ── Additional indexes ────────────────────────────────────────────────────
  await knex.schema.table(TABLE, (table) => {
    table.index('status',      'idx_files_status');
    table.index('sha256_hash', 'idx_files_sha256');
    table.index('created_at',  'idx_files_created_at');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  // Drop trigger and function first, then the table
  await knex.raw(`DROP TRIGGER IF EXISTS files_set_updated_at ON ${TABLE}`);
  await knex.raw(`DROP FUNCTION IF EXISTS set_updated_at()`);
  await knex.schema.dropTableIfExists(TABLE);
};
