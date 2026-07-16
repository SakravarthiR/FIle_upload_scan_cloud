/**
 * api/src/swagger.js
 *
 * OpenAPI 3.0 specification for the Secure File Upload API.
 * Loaded by swagger-jsdoc which scans JSDoc @openapi annotations
 * from each route file and merges them into a single spec.
 */

'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const path         = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Secure File Upload & Malware Scanning API',
      version:     '1.0.0',
      description: `
REST API for securely uploading files, scanning them for malware with ClamAV,
and retrieving results in real time via Socket.io.

**Authentication:** All protected routes require a \`Bearer\` JWT token in the
\`Authorization\` header. Obtain one via \`POST /auth/login\`.

**File upload pipeline:**
1. Upload file → API saves to quarantine dir
2. API enqueues a BullMQ job
3. Scan Worker computes SHA-256, validates MIME type, scans with ClamAV
4. Result persisted to PostgreSQL
5. Socket.io pushes result to the browser in real time
      `.trim(),
      contact: {
        name: 'API Support',
        url:  'https://github.com/SakravarthiR/FIle_upload_scan_cloud',
      },
      license: {
        name: 'MIT',
        url:  'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development server' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT token obtained from POST /auth/login',
        },
      },
      schemas: {
        // ── Auth ────────────────────────────────────────────────────────────
        LoginRequest: {
          type:     'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', format: 'password', example: 'secret123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Bearer token (valid 24 h)' },
            user: {
              type: 'object',
              properties: {
                userId: { type: 'string', format: 'uuid' },
                email:  { type: 'string', format: 'email' },
              },
            },
          },
        },

        // ── Auth success (register + login) ────────────────────────────────
        AuthSuccess: {
          type: 'object',
          properties: {
            access_token: { type: 'string', description: 'Short-lived JWT access token (15 min)' },
            token_type:   { type: 'string', example: 'Bearer' },
            expires_in:   { type: 'number', example: 900, description: 'Seconds until access token expires' },
            user: {
              type: 'object',
              properties: {
                userId:       { type: 'string', format: 'uuid' },
                email:        { type: 'string', format: 'email' },
                display_name: { type: 'string', nullable: true },
              },
            },
          },
        },

        // ── File record ─────────────────────────────────────────────────────
        FileRecord: {
          type: 'object',
          properties: {
            file_id:           { type: 'string', format: 'uuid' },
            user_id:           { type: 'string', format: 'uuid' },
            original_filename: { type: 'string', example: 'report.pdf' },
            status: {
              type: 'string',
              enum: ['PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'UNKNOWN'],
              example: 'PENDING',
            },
            sha256_hash:      { type: 'string', nullable: true, example: 'abc123...' },
            virus_name:       { type: 'string', nullable: true, example: 'Eicar-Test-Signature' },
            scan_time:        { type: 'string', format: 'date-time', nullable: true },
            scanner_version:  { type: 'string', nullable: true, example: 'ClamAV 1.0.0/27000' },
            download_path:    { type: 'string', nullable: true },
            quarantine_path:  { type: 'string', nullable: true },
            created_at:       { type: 'string', format: 'date-time' },
            updated_at:       { type: 'string', format: 'date-time' },
          },
        },

        // ── Upload response ─────────────────────────────────────────────────
        UploadResponse: {
          type: 'object',
          properties: {
            file_id:           { type: 'string', format: 'uuid' },
            status:            { type: 'string', example: 'PENDING' },
            original_filename: { type: 'string', example: 'report.pdf' },
            job_id:            { type: 'string', example: '42' },
            message:           { type: 'string', example: 'File received and queued for scanning.' },
          },
        },

        // ── Error ───────────────────────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            error:   { type: 'string', example: 'Unauthorized' },
            message: { type: 'string', example: 'Missing or invalid Bearer token.' },
          },
        },

        // ── Health ──────────────────────────────────────────────────────────
        HealthResponse: {
          type: 'object',
          properties: {
            status:    { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },

      responses: {
        Unauthorized: {
          description: 'Missing or invalid JWT token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'Unauthorized', message: 'Missing or invalid Bearer token.' },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but not allowed to access this resource',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'Forbidden', message: 'Access denied.' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'NotFound', message: 'File record not found.' },
            },
          },
        },
      },
    },

    // Default security — all routes require Bearer unless overridden
    security: [{ BearerAuth: [] }],

    tags: [
      { name: 'Auth',   description: 'Authentication — login and token management' },
      { name: 'Upload', description: 'File upload and scan pipeline' },
      { name: 'Files',  description: 'File listing and download' },
      { name: 'Status', description: 'Per-file scan status queries' },
      { name: 'System', description: 'Health check and diagnostics' },
    ],
  },

  // Scan all route files for @openapi JSDoc annotations
  apis: [
    path.join(__dirname, 'routes', '*.js'),
    path.join(__dirname, 'index.js'),
    path.join(__dirname, 'app.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
