/**
 * app.js
 *
 * Express application factory.
 * Wires up global middleware, routes, and error handling.
 * Kept separate from index.js so it's easily testable in isolation.
 */

'use strict';

const express         = require('express');
const cors            = require('cors');
const { globalLimiter }  = require('./middleware/rateLimiter');
const { errorHandler }   = require('./middleware/errorHandler');
const uploadRoute        = require('./routes/upload');
const statusRoute        = require('./routes/status');
const authRoute          = require('./routes/auth');
const filesRoute         = require('./routes/files');

const app = express();

// ── Trust first proxy if behind nginx / load balancer ─────────────────────
app.set('trust proxy', 1);

// ── CORS — allow the Vite dev server (port 5173) ──────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:4173',  // Vite preview
    'http://127.0.0.1:5173',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Global middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(globalLimiter);

// ── Health check (no auth required) ───────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/auth',   authRoute);
app.use('/upload', uploadRoute);
app.use('/status', statusRoute);
app.use('/files',  filesRoute);

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'NotFound', message: 'Route does not exist.' });
});

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

module.exports = app;
