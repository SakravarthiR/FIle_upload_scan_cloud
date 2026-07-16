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
const helmet          = require('helmet');
const cookieParser    = require('cookie-parser');
const swaggerUi       = require('swagger-ui-express');
const swaggerSpec     = require('./swagger');
const { globalLimiter }  = require('./middleware/rateLimiter');
const { errorHandler }   = require('./middleware/errorHandler');
const uploadRoute        = require('./routes/upload');
const statusRoute        = require('./routes/status');
const authRoute          = require('./routes/auth');
const filesRoute         = require('./routes/files');
const adminRoute         = require('./routes/admin');

const app = express();

// ── Trust first proxy if behind nginx / load balancer ─────────────────────
app.set('trust proxy', 1);

// ── CORS — allow any localhost port (handles Vite using 5173, 5174, etc.) ─
const CORS_DEV_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const CORS_PROD_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost port in development
    if (process.env.NODE_ENV !== 'production' && CORS_DEV_REGEX.test(origin)) {
      return callback(null, true);
    }
    // Allow explicitly listed production origins
    if (CORS_PROD_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Security headers (helmet) ──────────────────────────────────────────────
app.use(helmet({
  // Allow Swagger UI to load its own scripts/styles
  contentSecurityPolicy: false,
}));

// ── Global middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser()); // needed for HttpOnly refresh token cookie
app.use(globalLimiter);

// ── Swagger UI (no auth required) ────────────────────────────────────────
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Secure Upload API Docs',
    customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
    swaggerOptions: {
      persistAuthorization: true,   // keep the JWT across page reloads
      displayRequestDuration: true,
    },
  })
);

// Raw OpenAPI JSON spec — useful for import into Postman / Insomnia
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Health check (no auth required) ───────────────────────────────────────
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Returns API status and server timestamp. No authentication required.
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/auth',   authRoute);
app.use('/upload', uploadRoute);
app.use('/status', statusRoute);
app.use('/files',  filesRoute);
app.use('/admin',  adminRoute);

// ── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'NotFound', message: 'Route does not exist.' });
});

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorHandler);

module.exports = app;
