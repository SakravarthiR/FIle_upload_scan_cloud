# Secure File Upload & Malware Scanning System

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=for-the-badge&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![ClamAV](https://img.shields.io/badge/ClamAV-Antivirus-EF3B2D?style=for-the-badge&logo=shield&logoColor=white)
![VirusTotal](https://img.shields.io/badge/VirusTotal-API%20v3-394EFF?style=for-the-badge&logo=virustotal&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![CI](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**A full-stack, production-ready secure file upload platform with dual-engine malware scanning, production-grade authentication, role-based access control, real-time notifications, and a retro-themed React dashboard.**

</div>

---

## Features

### Security
- **Dual-Engine Malware Scanning** — ClamAV (primary) + VirusTotal API v3 (second opinion, 72+ engines)
- **Production Authentication** — bcrypt password hashing (cost 12), account lockout, timing-attack prevention
- **OTP Email Verification** — 6-digit code sent on registration; login blocked until verified
- **Two-Token Session Architecture** — 15-min access token (memory-only) + 7-day refresh token (HttpOnly cookie)
- **Refresh Token Rotation** — old token revoked on every refresh, limits stolen-token damage window
- **Signed Download URLs** — HMAC-SHA256 signed, user-bound, 15-minute expiry, constant-time verification
- **Role-Based Access Control** — `user` / `admin` roles embedded in JWT; admin dashboard endpoints
- **Brute-Force Protection** — 5 failed logins → 30-min lockout stored in DB
- **Helmet.js Security Headers** — X-Frame-Options, X-Content-Type-Options, HSTS, etc.
- **IP Rate Limiting** — 5 auth requests / 15 min per IP (credential stuffing prevention)
- **Triple-Layer MIME Validation** — extension allow-list → magic-byte check → ClamAV stream

### Platform
- **Real-time Status Updates** — Socket.io push events; zero polling
- **Background Job Queue** — BullMQ + Redis for reliable, retryable scan jobs
- **Comprehensive Audit Logs** — every security event persisted to `audit_logs` table
- **Scan Result Email Notifications** — premium HTML email on CLEAN / INFECTED / ERROR
- **Retro Dashboard** — React 19 + Vite with a vintage "Bureau of File Inspection" aesthetic
- **Swagger / OpenAPI Docs** — live interactive docs at `/api-docs`
- **Fully Dockerised** — one command spins up Postgres, Redis, and ClamAV
- **GitHub Actions CI** — lint, test (with live Postgres + Redis), security audit, frontend build

---

## Architecture

```
┌────────────────────────┐     HTTPS / WS      ┌──────────────────────────────────────┐
│   Browser (React 19)   │ ──────────────────► │            API Service                │
│                        │                      │  Express · Helmet · Cookie-Parser     │
│  Access token: memory  │ ◄── Socket.io ─────  │  JWT · Multer · Socket.io             │
│  Refresh token: cookie │                      │  Port 3000                            │
└────────────────────────┘                      └──────────────┬───────────────────────┘
                                                               │ BullMQ enqueue
                                                               ▼
                                               ┌───────────────────────────┐
                                               │       Redis 7 (BullMQ)    │
                                               │       Port 6379           │
                                               └───────────────┬───────────┘
                                                               │ dequeue
                                                               ▼
                                               ┌───────────────────────────────┐
                                               │          Scan Worker           │
                                               │  1. SHA-256 hash              │
                                               │  2. Magic-byte MIME check     │
                                               │  3. ClamAV stream scan        │
                                               │  4. VirusTotal API (advisory) │
                                               │  5. Decision engine           │
                                               │  6. Email notification        │
                                               └──────┬────────────┬───────────┘
                                                      │            │
                                          ┌───────────┘            └──────────────┐
                                          ▼                                        ▼
                              ┌──────────────────┐                   ┌──────────────────────┐
                              │   PostgreSQL 16  │                   │  ClamAV + VirusTotal  │
                              │   Port 5432      │                   │  Port 3310 / HTTPS    │
                              │ files            │                   └──────────────────────┘
                              │ users            │
                              │ audit_logs       │
                              └──────────────────┘
```

---

## Project Structure

```
/
├── api/                         # REST API service (Express + Socket.io)
│   └── src/
│       ├── index.js             # Server entry point
│       ├── app.js               # Express app, middleware, route mounting
│       ├── config.js            # Centralised environment config
│       ├── swagger.js           # OpenAPI / Swagger definition
│       ├── middleware/
│       │   ├── auth.js          # JWT authenticate middleware
│       │   ├── rbac.js          # requireRole / requireAdmin middleware
│       │   ├── rateLimiter.js   # uploadLimiter + authLimiter
│       │   └── mimeValidator.js # Magic-byte MIME validation
│       ├── routes/
│       │   ├── auth.js          # register, login, refresh, logout, /me, verify-otp
│       │   ├── upload.js        # POST /upload
│       │   ├── files.js         # GET /files, signed-url, download
│       │   ├── status.js        # GET /status/:fileId
│       │   └── admin.js         # Admin-only: audit logs, users, stats
│       └── utils/
│           ├── mailer.js        # Nodemailer — OTP + scan result emails
│           └── signedUrl.js     # HMAC-SHA256 signed URL generation/verification
│
├── scan-worker/                 # BullMQ scan worker
│   └── src/
│       ├── index.js             # Worker entry point
│       ├── processor.js         # 9-stage scan pipeline
│       ├── decisionEngine.js    # Outcome handler (CLEAN/INFECTED/ERROR/UNKNOWN)
│       ├── scanner/
│       │   ├── clamavClient.js  # ClamAV TCP socket client
│       │   └── virusTotalClient.js  # VirusTotal API v3 (hash-lookup + upload + poll)
│       └── utils/
│           └── mailer.js        # Scan result email notifications
│
├── shared/                      # Shared DB layer (npm workspace)
│   └── src/
│       ├── index.js             # Public surface area — exports all modules
│       └── db/
│           ├── knexfile.js
│           ├── connection.js
│           ├── FileRepository.js
│           ├── UserRepository.js
│           ├── AuditRepository.js   # Append-only audit log
│           └── migrations/
│               ├── 20240101000000_create_files_table.js
│               ├── 20240102000000_create_users_table.js
│               ├── 20240103000000_add_otp_to_users.js
│               ├── 20240104000000_create_audit_logs_table.js
│               ├── 20240105000000_add_virustotal_to_files.js
│               └── 20240106000000_add_role_to_users.js
│
├── frontend/                    # React 19 + Vite dashboard
│   └── src/
│       ├── context/
│       │   ├── AuthContext.jsx  # In-memory access token, silent session restore
│       │   └── ToastContext.jsx
│       ├── services/
│       │   ├── api.js           # Axios + auto-refresh interceptor
│       │   └── socket.js
│       └── pages/
│           ├── LoginPage.jsx    # Login + Register tabs, strength meter, OTP redirect
│           └── VerifyOtpPage.jsx
│
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions — lint, test, audit, build
│
├── docker-compose.yml           # PostgreSQL · Redis · ClamAV
├── dev.ps1                      # Windows dev convenience script
├── .env.example                 # Full environment variable template
└── package.json                 # Monorepo root (npm workspaces)
```

---

## Quick Start

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| [Node.js](https://nodejs.org/) | >= 22 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest |
| npm | >= 9 |

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/secure-file-upload.git
cd secure-file-upload
npm install
```

### 2. Configure Environment

```bash
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
```

The defaults work for local development without any changes. For real email delivery and VirusTotal, see the [Environment Variables](#environment-variables) section.

### 3. Start Infrastructure

```bash
npm run docker:up
```

Spins up **PostgreSQL 16**, **Redis 7**, and **ClamAV** in Docker.

> **Note:** ClamAV downloads its virus database on first run (~200 MB). Wait ~2 minutes on first start; subsequent starts are instant.

```bash
docker-compose ps   # STATUS should show "healthy" for postgres
```

### 4. Run Migrations

```bash
npm run migrate
```

This creates all 6 database tables: `files`, `users`, `audit_logs`, and the columns for OTP, VirusTotal results, and RBAC roles.

Expected output:
```
Batch 1 run: 6 migrations
```

### 5. Start All Services

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **API** | http://localhost:3000 |
| **Swagger Docs** | http://localhost:3000/api-docs |
| **Socket.io** | ws://localhost:3000 |

---

## Authentication Flow

```
Register ──► Email (OTP) ──► Verify OTP ──► Login ──► Dashboard
                                                         │
                                     (15 min later)      │
                                   Silent token refresh ◄─┘
                                   via HttpOnly cookie
```

1. **Register** — creates account, sends 6-digit OTP to email
2. **Verify OTP** — marks `email_verified = true`; OTP expires in 10 minutes
3. **Login** — issues 15-min access token (memory) + 7-day refresh token (HttpOnly cookie)
4. **Refresh** — auto-triggered by Axios interceptor on 401; rotates both tokens
5. **Logout** — revokes refresh token server-side, clears cookie

---

## Scan Pipeline

Every uploaded file passes through a 9-stage pipeline in the scan worker:

| Stage | Description |
|-------|-------------|
| 1 | Load DB record |
| 2 | Verify file exists on disk |
| 3 | Compute SHA-256 hash |
| 4 | Magic-byte MIME validation |
| 5 | Ping ClamAV daemon |
| 6 | Capture ClamAV engine version |
| 7 | Stream file through ClamAV |
| 8 | VirusTotal second opinion (if API key set) |
| 9 | Decision engine — CLEAN / INFECTED / ERROR / UNKNOWN |

On completion, the user receives:
- A **Socket.io real-time push** event in the browser
- A **scan result email** (premium HTML template)

---

## Role-Based Access Control

| Role | Permissions |
|------|-------------|
| `user` | Upload, download own files, view own audit trail |
| `admin` | All user permissions + audit log viewer, user list, role management, system stats |

**Promoting a user to admin:**
```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

They must re-login for the new role to be reflected in their JWT.

**Admin API endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /admin/audit-logs` | Paginated full audit log |
| `GET /admin/users` | All registered users |
| `PATCH /admin/users/:id/role` | Promote / demote a user |
| `GET /admin/stats` | User count, file counts by status, login activity |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# ── PostgreSQL ────────────────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=secure_upload
DB_USER=postgres
DB_PASSWORD=your_password_here

# ── JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<64-char random hex>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ── Auth policy
BCRYPT_COST=12
MAX_LOGIN_ATTEMPTS=5
LOCK_DURATION_MS=1800000

# ── Signed download URLs
SIGNED_URL_SECRET=<32-char random hex>

# ── Email (SMTP — or leave blank to use Ethereal test mail in dev)
SMTP_HOST=smtp.resend.com      # or smtp.gmail.com
SMTP_PORT=465
SMTP_USER=resend               # or your Gmail address
SMTP_PASS=re_your_api_key      # or Gmail App Password

# ── VirusTotal (free tier: 500 req/day — https://www.virustotal.com)
VIRUSTOTAL_API_KEY=            # leave blank to skip VT scanning
```

> **Development without SMTP:** Leave `SMTP_HOST` blank. Nodemailer will use [Ethereal Mail](https://ethereal.email/) — a preview URL is printed in the terminal when an OTP or scan result email is sent.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + Worker + Frontend concurrently |
| `npm run dev:api` | API only |
| `npm run dev:worker` | Scan worker only |
| `npm run dev:front` | Frontend only |
| `npm run docker:up` | Start Postgres, Redis, ClamAV |
| `npm run docker:down` | Stop all Docker services |
| `npm run migrate` | Run all pending DB migrations |
| `npm run migrate:rollback` | Roll back the last migration batch |

---

## Database Schema

### `files`

| Column | Type | Notes |
|--------|------|-------|
| `file_id` | UUID | Primary key |
| `user_id` | UUID | FK → users.user_id |
| `original_filename` | TEXT | |
| `status` | VARCHAR(20) | `PENDING` · `CLEAN` · `INFECTED` · `ERROR` · `UNKNOWN` |
| `sha256_hash` | VARCHAR(64) | Deduplication key |
| `virus_name` | TEXT | ClamAV / VT signature |
| `scanner_version` | VARCHAR(100) | |
| `download_path` | TEXT | Path to clean file on disk |
| `vt_detection_ratio` | TEXT | e.g. `2/72` |
| `vt_detections` | JSONB | Array of flagging engine names |

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID | Primary key |
| `email` | TEXT UNIQUE | Lowercased |
| `password_hash` | TEXT | bcrypt, cost 12 |
| `role` | VARCHAR(20) | `user` \| `admin` |
| `email_verified` | BOOLEAN | Must be true to login |
| `failed_login_attempts` | INTEGER | Reset on success |
| `locked_until` | TIMESTAMPTZ | NULL = not locked |
| `refresh_token_hash` | TEXT | SHA-256 of raw token |
| `otp_hash` | TEXT | bcrypt hash of 6-digit code |
| `otp_expires_at` | TIMESTAMPTZ | 10 minutes from issue |

### `audit_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL | Primary key |
| `user_id` | UUID | Nullable (system events) |
| `action` | VARCHAR(80) | e.g. `USER_LOGIN`, `SCAN_INFECTED` |
| `resource_type` | TEXT | `file` \| `user` \| etc. |
| `resource_id` | TEXT | |
| `ip_address` | VARCHAR(45) | IPv4 / IPv6 |
| `metadata` | JSONB | Event-specific data |
| `outcome` | VARCHAR(20) | `SUCCESS` · `FAILURE` · `BLOCKED` |
| `created_at` | TIMESTAMPTZ | Indexed |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 6, Vanilla CSS, Socket.io-client |
| **API** | Express 4, Helmet, Multer, JWT, bcryptjs, Cookie-Parser, Socket.io |
| **Queue** | BullMQ, Redis 7 |
| **Worker** | Node.js, file-type, ClamAV (TCP), VirusTotal API v3, Nodemailer |
| **Database** | PostgreSQL 16, Knex.js |
| **Auth** | bcrypt (cost 12), HMAC-SHA256 signed URLs, HttpOnly cookies |
| **Email** | Nodemailer (Resend / Gmail / Ethereal) |
| **CI/CD** | GitHub Actions (lint · test · audit · build) |
| **Infra** | Docker Compose, npm workspaces |

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create account, send OTP email |
| `POST` | `/auth/verify-otp` | Verify 6-digit email code |
| `POST` | `/auth/login` | Login, receive access + refresh tokens |
| `POST` | `/auth/refresh` | Rotate tokens using HttpOnly cookie |
| `POST` | `/auth/logout` | Revoke refresh token server-side |
| `GET`  | `/auth/me` | Current user profile + role |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload file for scanning |
| `GET`  | `/files` | List user's files (includes signed URLs) |
| `GET`  | `/files/:id/signed-url` | Generate 15-min signed download URL |
| `GET`  | `/files/:id/download?sig=&exp=` | Stream clean file (signed URL required) |
| `GET`  | `/status/:fileId` | Scan status (for polling fallback) |

### Admin (role: admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/admin/audit-logs` | Paginated audit log |
| `GET`  | `/admin/users` | All users |
| `PATCH`| `/admin/users/:id/role` | Change a user's role |
| `GET`  | `/admin/stats` | System statistics |

> Full interactive docs available at **http://localhost:3000/api-docs**

---

## Security Architecture

| Threat | Mitigation |
|--------|-----------|
| Plain-text passwords | bcrypt hash, cost factor 12 |
| Brute force login | 5 attempts → 30-min lockout in DB |
| Credential stuffing | Auth rate limiter: 5 req / 15 min per IP |
| Account enumeration | Same error message + dummy bcrypt hash for unknown emails |
| Timing attacks | `bcrypt.compare()` always runs; constant-time HMAC comparison |
| XSS token theft | Access token in memory only — never `localStorage` |
| CSRF on cookie | `SameSite=Strict` on refresh token cookie |
| Stolen refresh token | Token rotation — old token invalidated on every `/auth/refresh` |
| Forged download URLs | HMAC-SHA256 user-bound signed URLs, 15-min expiry |
| MIME spoofing | Triple-layer: extension → magic bytes → ClamAV |
| Malware | ClamAV (primary) + VirusTotal 72-engine second opinion |
| Privilege escalation | Role embedded in JWT; RBAC middleware on admin routes |
| Missing headers | Helmet.js on all responses |

---

## CI / CD

GitHub Actions runs on every push to `main` / `develop` and every pull request:

```
push / PR
    │
    ├── Lint          (ESLint)
    ├── Test          (with live Postgres 16 + Redis 7 services)
    ├── Security      (npm audit --audit-level=high)
    └── Build         (Vite frontend build)
```

All jobs must pass before a PR can be merged.

---

## Testing

```bash
# Test database connection & repositories
node test-db.js

# Test the full infected-file pipeline
node test-infected.js

# Test WebSocket real-time events
node test-ws.js
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a Pull Request against `main`

All PRs must pass the GitHub Actions CI pipeline before review.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Built with Node.js · React · PostgreSQL · ClamAV · VirusTotal
</div>
