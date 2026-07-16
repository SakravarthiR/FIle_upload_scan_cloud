/**
 * shared/src/db/AuditRepository.js
 *
 * Append-only data-access layer for the `audit_logs` table.
 *
 * Usage:
 *   const audit = new AuditRepository(db);
 *   await audit.log({ userId, action: 'FILE_UPLOAD', resourceType: 'file', resourceId: fileId, ip, metadata: { filename } });
 */

'use strict';

const TABLE = 'audit_logs';

// ── Action constants — import these everywhere so strings never drift ─────────
const ACTIONS = {
  // Auth
  USER_REGISTER:        'USER_REGISTER',
  USER_LOGIN:           'USER_LOGIN',
  USER_LOGOUT:          'USER_LOGOUT',
  USER_LOGIN_FAILED:    'USER_LOGIN_FAILED',
  USER_LOCKED:          'USER_LOCKED',
  EMAIL_VERIFIED:       'EMAIL_VERIFIED',
  TOKEN_REFRESHED:      'TOKEN_REFRESHED',

  // Files
  FILE_UPLOAD:          'FILE_UPLOAD',
  FILE_DOWNLOAD:        'FILE_DOWNLOAD',
  FILE_LIST:            'FILE_LIST',
  FILE_STATUS_CHECKED:  'FILE_STATUS_CHECKED',

  // Scans
  SCAN_CLEAN:           'SCAN_CLEAN',
  SCAN_INFECTED:        'SCAN_INFECTED',
  SCAN_ERROR:           'SCAN_ERROR',
  SCAN_UNKNOWN:         'SCAN_UNKNOWN',

  // Security
  MIME_BLOCKED:         'MIME_BLOCKED',
  RATE_LIMITED:         'RATE_LIMITED',
  AUTH_DENIED:          'AUTH_DENIED',

  // Admin
  ADMIN_ACTION:         'ADMIN_ACTION',
};

class AuditRepository {
  /**
   * @param {import('knex').Knex} knex
   */
  constructor(knex) {
    this._db = knex;
  }

  /**
   * Append a single audit event. Never throws — audit failures must never
   * break the main request flow.
   *
   * @param {object} params
   * @param {string}  [params.userId]       - nullable for system events
   * @param {string}   params.action        - one of ACTIONS constants
   * @param {string}  [params.resourceType] - 'file' | 'user' | etc.
   * @param {string}  [params.resourceId]
   * @param {string}  [params.ip]
   * @param {string}  [params.userAgent]
   * @param {object}  [params.metadata]     - event-specific extra data
   * @param {string}  [params.outcome]      - 'SUCCESS' | 'FAILURE' | 'BLOCKED'
   */
  async log({
    userId       = null,
    action,
    resourceType = null,
    resourceId   = null,
    ip           = null,
    userAgent    = null,
    metadata     = {},
    outcome      = 'SUCCESS',
  }) {
    try {
      await this._db(TABLE).insert({
        user_id:       userId,
        action,
        resource_type: resourceType,
        resource_id:   resourceId,
        ip_address:    ip,
        user_agent:    userAgent,
        metadata:      JSON.stringify(metadata),
        outcome,
      });
    } catch (err) {
      // Audit failure is non-fatal
      console.error(`[Audit] Failed to write log entry (action=${action}):`, err.message);
    }
  }

  /**
   * Retrieve recent audit logs for a specific user.
   *
   * @param {string} userId
   * @param {{ limit?: number, offset?: number }} opts
   * @returns {Promise<object[]>}
   */
  async findByUserId(userId, { limit = 50, offset = 0 } = {}) {
    return this._db(TABLE)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  /**
   * Retrieve recent audit logs by action type (admin use).
   *
   * @param {string} action
   * @param {{ limit?: number }} opts
   * @returns {Promise<object[]>}
   */
  async findByAction(action, { limit = 100 } = {}) {
    return this._db(TABLE)
      .where({ action })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  /**
   * Retrieve all recent logs (admin dashboard — paginated).
   *
   * @param {{ limit?: number, offset?: number }} opts
   * @returns {Promise<object[]>}
   */
  async findRecent({ limit = 100, offset = 0 } = {}) {
    return this._db(TABLE)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }
}

module.exports = { AuditRepository, ACTIONS };
