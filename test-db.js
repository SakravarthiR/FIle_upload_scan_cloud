/**
 * test-db.js
 *
 * Standalone database verification script.
 * Run from the repo root:  node test-db.js
 *
 * Checks:
 *   1. PostgreSQL connectivity
 *   2. 'files' table existence
 *   3. Column names and data types
 *   4. CHECK constraint  (files_status_check)
 *   5. Trigger           (files_set_updated_at)
 */

'use strict';

const knex = require('knex');

// ── Hard-coded for the local Docker container ──────────────────────────────
const db = knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'secure_upload',
  },
  pool: { min: 1, max: 3 },
});

// ── Helpers ────────────────────────────────────────────────────────────────
const TABLE = 'files';

const hr = (char = '─', len = 60) => console.log(char.repeat(len));
const ok = (msg) => console.log(`  ✅  ${msg}`);
const err = (msg) => console.log(`  ❌  ${msg}`);
const inf = (msg) => console.log(`  ℹ️   ${msg}`);

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  hr('═');
  console.log('  🔍  Database Verification Script');
  console.log(`  📦  Target: postgres@localhost:5432/secure_upload`);
  hr('═');

  // ── 1. Connectivity ──────────────────────────────────────────────────────
  console.log('\n[1/4] Connection check');
  hr();
  await db.raw('SELECT 1');
  ok('Connected to PostgreSQL successfully.');

  // ── 2. Table existence ───────────────────────────────────────────────────
  console.log('\n[2/4] Table existence');
  hr();

  const { rows: tableRows } = await db.raw(`
    SELECT table_name
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = ?
  `, [TABLE]);

  if (tableRows.length === 0) {
    err(`Table "${TABLE}" does NOT exist. Did you run the migration?`);
    return; // Nothing more to check
  }
  ok(`Table "${TABLE}" exists.`);

  // ── 3. Columns & data types ──────────────────────────────────────────────
  console.log('\n[3/4] Columns & data types');
  hr();

  const { rows: columns } = await db.raw(`
    SELECT
      column_name,
      data_type,
      character_maximum_length  AS max_len,
      is_nullable,
      column_default
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = ?
    ORDER  BY ordinal_position
  `, [TABLE]);

  if (columns.length === 0) {
    err('No columns found — table may be empty or schema is wrong.');
  } else {
    // Pretty-print as a table
    const colW = 22, typeW = 20, nullW = 10;
    console.log(
      `  ${'COLUMN'.padEnd(colW)} ${'DATA TYPE'.padEnd(typeW)} ${'NULLABLE'.padEnd(nullW)} DEFAULT`
    );
    console.log(`  ${'-'.repeat(colW)} ${'-'.repeat(typeW)} ${'-'.repeat(nullW)} -------`);

    for (const col of columns) {
      const type = col.max_len
        ? `${col.data_type}(${col.max_len})`
        : col.data_type;
      const dflt = col.column_default
        ? col.column_default.replace(/::[\w\s]+/g, '').slice(0, 30)  // trim casts
        : '—';
      console.log(
        `  ${col.column_name.padEnd(colW)} ${type.padEnd(typeW)} ${col.is_nullable.padEnd(nullW)} ${dflt}`
      );
    }
    ok(`${columns.length} columns verified.`);
  }

  // ── 4a. CHECK constraint ─────────────────────────────────────────────────
  console.log('\n[4/4] Constraints & Triggers');
  hr();

  const { rows: constraints } = await db.raw(`
    SELECT
      conname                          AS constraint_name,
      pg_get_constraintdef(oid, true)  AS definition
    FROM   pg_constraint
    WHERE  conrelid = ?::regclass
      AND  contype  = 'c'
  `, [TABLE]);

  if (constraints.length === 0) {
    err('No CHECK constraints found on "files".');
  } else {
    for (const c of constraints) {
      ok(`CHECK constraint "${c.constraint_name}": ${c.definition}`);
    }
  }

  // ── 4b. Trigger ──────────────────────────────────────────────────────────
  const { rows: triggers } = await db.raw(`
    SELECT
      trigger_name,
      event_manipulation  AS event,
      action_timing       AS timing,
      action_orientation  AS orientation
    FROM   information_schema.triggers
    WHERE  event_object_schema = 'public'
      AND  event_object_table  = ?
  `, [TABLE]);

  if (triggers.length === 0) {
    err('No triggers found on "files". The updated_at trigger may be missing.');
  } else {
    for (const t of triggers) {
      ok(`Trigger "${t.trigger_name}" — ${t.timing} ${t.event} (${t.orientation})`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  hr('═');
  console.log('   All checks complete. Schema looks good!\n');
}

// ── Run & always destroy the pool ─────────────────────────────────────────
main()
  .catch((e) => {
    hr('═');
    console.error('\n    Fatal error during verification:');
    console.error(`      ${e.message}\n`);
    hr('═');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
    inf('Connection pool closed.');
  });
