/**
 * middleware/auth.js
 *
 * Verifies the Bearer JWT in the Authorization header.
 * On success, attaches `req.user = { userId, ...claims }`.
 * On failure, responds with 401 — never calls next(err) for
 * auth failures so the global error handler doesn't leak internals.
 */

'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config');

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let token;

  if (authHeader) {
    // Expect: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header must be in the format: Bearer <token>',
      });
    }
    token = parts[1];
  } else if (req.query.token) {
    // Fallback to query parameter (useful for <a href="..."> downloads)
    token = req.query.token;
  } else {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header is missing.',
    });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      algorithms: [config.jwt.algorithm],
    });

    // Require a userId claim — every token issued by this system must carry one
    if (!payload.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token is missing required claim: userId',
      });
    }

    req.user = payload;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token has expired.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token is invalid.' });
    }
    // Unexpected error — surface through global handler
    return next(err);
  }
}

module.exports = { authenticate };
