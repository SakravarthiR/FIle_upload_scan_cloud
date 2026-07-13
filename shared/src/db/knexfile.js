/**
 * knexfile.js
 * Knex configuration for all environments.
 * The actual connection values come from the root .env file
 * (loaded via dotenv from the workspace root).
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'secure_upload',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  pool: {
    min: Number(process.env.DB_POOL_MIN) || 2,
    max: Number(process.env.DB_POOL_MAX) || 10,
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
    extension: 'js',
  },
};

module.exports = {
  development: { ...base },
  test:        { ...base, connection: { ...base.connection, database: 'secure_upload_test' } },
  production:  { ...base, pool: { min: 4, max: 20 } },
};
