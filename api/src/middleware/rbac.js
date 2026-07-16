/**
 * api/src/middleware/rbac.js
 *
 * Role-Based Access Control (RBAC) middleware.
 *
 * Usage (always chain AFTER authenticate):
 *   router.get('/admin/logs', authenticate, requireRole('admin'), handler);
 *   router.get('/profile',    authenticate, requireRole('user', 'admin'), handler);
 *
 * Role hierarchy:
 *   admin > user
 *
 * The role is embedded in the JWT at login time so no extra DB query is needed
 * on every request.
 */

'use strict';

const ROLE_HIERARCHY = { user: 1, admin: 2 };

/**
 * Middleware factory — requires the authenticated user to have one of the
 * specified roles. Must be used after `authenticate`.
 *
 * @param {...string} roles  Accepted roles, e.g. 'admin' or 'user', 'admin'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(403).json({
        error:   'Forbidden',
        message: 'No role information found in token.',
      });
    }

    const allowed = roles.some((r) => {
      const userLevel    = ROLE_HIERARCHY[userRole]    ?? 0;
      const requiredLevel = ROLE_HIERARCHY[r] ?? 99;
      return userLevel >= requiredLevel;
    });

    if (!allowed) {
      return res.status(403).json({
        error:   'Forbidden',
        message: `This endpoint requires one of the following roles: ${roles.join(', ')}.`,
      });
    }

    return next();
  };
}

/**
 * Convenience shorthand — admin only.
 */
const requireAdmin = requireRole('admin');

module.exports = { requireRole, requireAdmin };
