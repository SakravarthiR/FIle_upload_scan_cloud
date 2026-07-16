/**
 * api/src/routes/admin.js
 *
 * Admin-only endpoints. All routes require:
 *   1. authenticate  — valid JWT
 *   2. requireAdmin  — role === 'admin' in the JWT
 *
 * Endpoints:
 *   GET  /admin/audit-logs           — paginated audit log viewer
 *   GET  /admin/users                — list all users
 *   PATCH /admin/users/:id/role      — promote/demote a user
 *   GET  /admin/stats                — system-wide statistics
 */

'use strict';

const express = require('express');
const { authenticate }         = require('../middleware/auth');
const { requireAdmin }         = require('../middleware/rbac');
const { db, AuditRepository, UserRepository, FileRepository, ACTIONS } = require('@secure-upload/shared');

const router     = express.Router();
const audit      = new AuditRepository(db);
const userRepo   = new UserRepository(db);
const fileRepo   = new FileRepository(db);

// Apply auth + admin check to every route in this file
router.use(authenticate, requireAdmin);

// ── GET /admin/audit-logs ─────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: View all audit logs (admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Filter by action type, e.g. USER_LOGIN
 *     responses:
 *       200:
 *         description: Array of audit log entries
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const action = req.query.action || null;

    const logs = action
      ? await audit.findByAction(action, { limit })
      : await audit.findRecent({ limit, offset });

    return res.json({ logs, total: logs.length, limit, offset });
  } catch (err) {
    return next(err);
  }
});

// ── GET /admin/users ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all registered users (admin only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user records
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await db('users')
      .select([
        'user_id', 'email', 'display_name', 'role',
        'email_verified', 'failed_login_attempts',
        'locked_until', 'last_login_at', 'created_at',
      ])
      .orderBy('created_at', 'desc')
      .limit(500);

    return res.json({ users, total: users.length });
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /admin/users/:id/role ────────────────────────────────────────────────

/**
 * @openapi
 * /admin/users/{userId}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Change a user's role (admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Invalid role value
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.patch('/users/:userId/role', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role }   = req.body ?? {};

    const VALID_ROLES = ['user', 'admin'];
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error:   'BadRequest',
        message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    // Prevent self-demotion (admin removing their own admin role)
    if (userId === req.user.userId && role !== 'admin') {
      return res.status(400).json({
        error:   'BadRequest',
        message: 'You cannot change your own role.',
      });
    }

    const updated = await db('users')
      .where({ user_id: userId })
      .update({ role })
      .returning(['user_id', 'email', 'role']);

    if (!updated.length) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    }

    // Audit the role change
    audit.log({
      userId: req.user.userId,
      action: ACTIONS.ADMIN_ACTION,
      resourceType: 'user',
      resourceId: userId,
      ip: req.ip,
      metadata: { action: 'role_change', newRole: role, targetUser: updated[0].email },
    }).catch(() => {});

    return res.json({ message: `Role updated to "${role}".`, user: updated[0] });
  } catch (err) {
    return next(err);
  }
});

// ── GET /admin/stats ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: System-wide statistics (admin only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregated stats object
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalFiles,
      filesByStatus,
      recentLogins,
    ] = await Promise.all([
      db('users').count('user_id as count').first(),
      db('files').count('file_id as count').first(),
      db('files').select('status').count('file_id as count').groupBy('status'),
      db('audit_logs')
        .where({ action: ACTIONS.USER_LOGIN })
        .where('created_at', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
        .count('id as count')
        .first(),
    ]);

    const statusMap = {};
    filesByStatus.forEach(r => { statusMap[r.status] = Number(r.count); });

    return res.json({
      users: {
        total: Number(totalUsers.count),
      },
      files: {
        total:    Number(totalFiles.count),
        by_status: statusMap,
      },
      activity: {
        logins_last_24h: Number(recentLogins?.count ?? 0),
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
