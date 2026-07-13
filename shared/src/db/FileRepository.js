/**
 * FileRepository
 *
 * Data-access layer for the `files` table.
 * All DB logic is isolated here — the API and scan-worker import
 * this class, not raw SQL, so storage concerns stay in one place.
 *
 * Usage:
 *   const FileRepository = require('@secure-upload/shared/src/db/FileRepository');
 *   const repo = new FileRepository(db);           // pass the knex instance
 *   const file = await repo.create({ user_id, original_filename, sha256_hash });
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/** @typedef {'PENDING'|'CLEAN'|'INFECTED'|'ERROR'|'UNKNOWN'} FileStatus */

const VALID_STATUSES = new Set(['PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'UNKNOWN']);
const TABLE = 'files';

class FileRepository {
  /**
   * @param {import('knex').Knex} db - Knex instance (from connection.js)
   */
  constructor(db) {
    this.db = db;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Insert a new file record with PENDING status.
   *
   * @param {{
   *   user_id: string,
   *   original_filename: string,
   *   sha256_hash?: string,
   * }} data
   * @returns {Promise<Object>} The newly created row
   */
  async create({ user_id, original_filename, sha256_hash = null }) {
    const [row] = await this.db(TABLE)
      .insert({
        file_id:           uuidv4(),
        user_id,
        original_filename,
        status:            'PENDING',
        sha256_hash,
      })
      .returning('*');

    return row;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Find a single file record by its primary key.
   *
   * @param {string} file_id
   * @returns {Promise<Object|null>}
   */
  async findById(file_id) {
    const row = await this.db(TABLE).where({ file_id }).first();
    return row ?? null;
  }

  /**
   * Find all file records belonging to a user, ordered newest-first.
   *
   * @param {string} user_id
   * @param {{ limit?: number, offset?: number }} [pagination]
   * @returns {Promise<Object[]>}
   */
  async findByUserId(user_id, { limit = 20, offset = 0 } = {}) {
    return this.db(TABLE)
      .where({ user_id })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  /**
   * Find a file record by its SHA-256 hash (useful for deduplication).
   *
   * @param {string} sha256_hash
   * @returns {Promise<Object|null>}
   */
  async findByHash(sha256_hash) {
    const row = await this.db(TABLE)
      .where({ sha256_hash })
      .orderBy('created_at', 'desc')
      .first();
    return row ?? null;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /**
   * Generic patch — use the typed helpers below for common transitions.
   *
   * @param {string} file_id
   * @param {Partial<Object>} fields
   * @returns {Promise<Object|null>} Updated row
   */
  async update(file_id, fields) {
    const [row] = await this.db(TABLE)
      .where({ file_id })
      .update(fields)
      .returning('*');
    return row ?? null;
  }

  /**
   * Mark a file as CLEAN after a successful scan.
   *
   * @param {string} file_id
   * @param {{
   *   scanner_version: string,
   *   download_path: string,
   *   scan_time?: Date,
   * }} scanResult
   * @returns {Promise<Object|null>}
   */
  async markClean(file_id, { scanner_version, download_path, scan_time = new Date() }) {
    return this.update(file_id, {
      status:          'CLEAN',
      scanner_version,
      download_path,
      scan_time,
      virus_name:      null,
      quarantine_path: null,
    });
  }

  /**
   * Mark a file as INFECTED after a positive scan result.
   *
   * @param {string} file_id
   * @param {{
   *   virus_name: string,
   *   scanner_version: string,
   *   quarantine_path: string,
   *   scan_time?: Date,
   * }} scanResult
   * @returns {Promise<Object|null>}
   */
  async markInfected(file_id, { virus_name, scanner_version, quarantine_path, scan_time = new Date() }) {
    return this.update(file_id, {
      status: 'INFECTED',
      virus_name,
      scanner_version,
      quarantine_path,
      scan_time,
      download_path: null,
    });
  }

  /**
   * Mark a file as ERROR when the scan pipeline fails.
   *
   * @param {string} file_id
   * @param {{ reason?: string }} [opts]
   * @returns {Promise<Object|null>}
   */
  async markError(file_id, { reason } = {}) {
    return this.update(file_id, {
      status:     'ERROR',
      virus_name: reason ?? null,
      scan_time:  new Date(),
    });
  }

  /**
   * Validate that a status value is one of the allowed enum values.
   *
   * @param {string} status
   * @returns {boolean}
   */
  static isValidStatus(status) {
    return VALID_STATUSES.has(status);
  }
}

module.exports = FileRepository;
