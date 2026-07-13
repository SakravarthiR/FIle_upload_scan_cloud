/**
 * api/src/routes/auth.js
 *
 * Development-mode auth endpoint.
 * Accepts any email/password and returns a signed JWT.
 * Replace this with real authentication (OAuth, bcrypt, etc.) in production.
 */

'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const { v5: uuidv5 } = require('uuid');
const config  = require('../config');

const router = express.Router();

// Stable namespace for deterministic UUID generation from email
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns: { token, user: { userId, email } }
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'email and password are required.',
    });
  }

  // Derive a stable userId from the email (same user always gets same UUID)
  const userId = uuidv5(email.toLowerCase().trim(), NS);

  const token = jwt.sign(
    { userId, email: email.toLowerCase().trim() },
    config.jwt.secret,
    { algorithm: config.jwt.algorithm, expiresIn: '24h' }
  );

  return res.json({
    token,
    user: { userId, email: email.toLowerCase().trim() },
  });
});

module.exports = router;
