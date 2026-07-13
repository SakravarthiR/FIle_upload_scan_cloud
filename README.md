# Secure File Upload & Malware Scanning System

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![ClamAV](https://img.shields.io/badge/ClamAV-antivirus-EF3B2D?style=for-the-badge&logo=shield&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**A full-stack, production-ready secure file upload platform with real-time malware scanning, JWT authentication, and a retro-themed React dashboard.**

</div>

---

## Features

- **Secure File Uploads** — Multer-powered ingestion with SHA-256 deduplication
- **Real-time Malware Scanning** — ClamAV antivirus via BullMQ background jobs
- **JWT Authentication** — Token-based auth guarding all upload & download routes
- **Live Status Updates** — Socket.io push events from worker to browser (no polling)
- **Persistent Scan Records** — PostgreSQL with a full audit trail per file
- **Job Queue** — BullMQ + Redis for reliable, retryable scan jobs
- **Retro Dashboard** — React 19 + Vite frontend with a vintage "aged paper" aesthetic
- **Fully Dockerised** — One command spins up Postgres, Redis, and ClamAV

---

## Architecture

```
┌─────────────┐   HTTP/multipart    ┌───────────────────────────────────────┐
│   Browser   │ ──────────────────► │              API Service               │
│  (React 19) │                     │  Express · Multer · JWT · Socket.io    │
│  Vite · TW  │ ◄── Socket.io ────  │  Port 3000                             │
└─────────────┘   (scan results)    └───────────────┬───────────────────────┘
                                                    │ BullMQ enqueue
                                                    ▼
                                    ┌───────────────────────────┐
                                    │        Redis (BullMQ)      │
                                    │        Port 6379           │
                                    └───────────────┬───────────┘
                                                    │ dequeue
                                                    ▼
                                    ┌───────────────────────────┐
                                    │       Scan Worker          │
                                    │  streams file → ClamAV    │
                                    │  persists result → PG     │
                                    └───────┬───────────┬───────┘
                                            │           │
                                            ▼           ▼
                              ┌──────────────┐  ┌────────────────┐
                              │  PostgreSQL  │  │    ClamAV      │
                              │   Port 5432  │  │   Port 3310    │
                              └──────────────┘  └────────────────┘
```

---

## Project Structure

```
/
├── api/                    # REST API service (Express + Socket.io)
│   └── src/
│       ├── index.js        # Server entry point
│       ├── config.js       # Environment config
│       └── routes/         # Upload, download, status routes
│
├── scan-worker/            # BullMQ scan worker
│   └── src/
│       ├── index.js        # Worker entry point
│       └── config.js       # Worker environment config
│
├── shared/                 # Shared DB layer (npm workspace)
│   └── src/
│       └── db/
│           ├── knexfile.js                               # Knex config
│           ├── connection.js                             # Singleton pool
│           ├── FileRepository.js                        # Data-access layer
│           └── migrations/
│               └── 20240101000000_create_files_table.js
│
├── frontend/               # React 19 + Vite dashboard
│   └── src/
│
├── docker-compose.yml      # PostgreSQL · Redis · ClamAV
├── dev.ps1                 # Windows dev convenience script
├── .env.example            # Environment variable template
└── package.json            # Monorepo root (npm workspaces)
```

---

## Quick Start

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| [Node.js](https://nodejs.org/) | >= 18 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | latest |
| npm | >= 9 |

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/secure-file-upload.git
cd secure-file-upload
npm install
```

### 2. Configure Environment

```bash
# Copy the template (defaults match docker-compose exactly)
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
```

> **No editing needed** for local development — the defaults connect to the Docker services out of the box.

### 3. Start Infrastructure

```bash
npm run docker:up
```

This spins up **PostgreSQL 16**, **Redis 7**, and **ClamAV** in the background.  
Wait ~10 s for PostgreSQL to become healthy:

```bash
docker-compose ps
# STATUS column should show "healthy" for postgres
```

> **Note:** ClamAV downloads its virus database on first run. The first `start_period` is 120 s — subsequent starts are instant (database is cached in a Docker volume).

### 4. Run Migrations

```bash
npm run migrate
```

Expected output:
```
Batch 1 run: 1 migrations
```

### 5. Start All Services

```bash
# Starts API + Scan Worker + Frontend dev server (concurrently)
npm run dev
```

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| Frontend | http://localhost:5173 |
| Socket.io | ws://localhost:3000 |

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
| `npm run migrate` | Run pending DB migrations |
| `npm run migrate:rollback` | Roll back the last migration batch |

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=secure_upload
DB_USER=postgres
DB_PASSWORD=your_password_here

# Connection pool
DB_POOL_MIN=2
DB_POOL_MAX=10

# Node environment
NODE_ENV=development
```

---

## Database Schema

| Column | Type | Notes |
|--------|------|-------|
| `file_id` | UUID | Primary key — `uuid_generate_v4()` |
| `user_id` | UUID | Indexed |
| `original_filename` | TEXT | |
| `status` | VARCHAR(20) | `PENDING` · `CLEAN` · `INFECTED` · `ERROR` · `UNKNOWN` |
| `sha256_hash` | VARCHAR(64) | Indexed — deduplication key |
| `virus_name` | TEXT | ClamAV signature name (INFECTED only) |
| `scan_time` | TIMESTAMPTZ | Set when scan completes |
| `scanner_version` | VARCHAR(100) | ClamAV engine + DB version at scan time |
| `download_path` | TEXT | Path to clean file |
| `quarantine_path` | TEXT | Path to isolated infected file |
| `created_at` | TIMESTAMPTZ | Indexed — auto `now()` |
| `updated_at` | TIMESTAMPTZ | Auto-maintained by PG trigger |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, TailwindCSS 3, Socket.io-client |
| **API** | Express 4, Multer 2, JWT (jsonwebtoken), Socket.io, express-rate-limit |
| **Queue** | BullMQ, Redis 7 |
| **Worker** | Node.js, file-type, ClamAV (via TCP socket) |
| **Database** | PostgreSQL 16, Knex.js |
| **Infra** | Docker Compose, npm workspaces |

---

## API Reference

### `POST /upload`
Upload a file for scanning. Requires a valid JWT in the `Authorization` header.

```
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body: file=<binary>
```

**Response:**
```json
{
  "file_id": "uuid",
  "status": "PENDING",
  "original_filename": "document.pdf",
  "sha256_hash": "abc123..."
}
```

### `GET /files`
List all files for the authenticated user.

### `GET /files/:id`
Get scan status for a specific file.

### `GET /download/:id`
Download a `CLEAN` file. Returns `403` for `INFECTED` or `PENDING` files.

### Socket.io Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `scan:complete` | Server → Client | `{ file_id, status, virus_name? }` |
| `scan:error` | Server → Client | `{ file_id, reason }` |

---

## FileRepository API

```js
const { db, FileRepository } = require('@secure-upload/shared');
const repo = new FileRepository(db);

// Create a pending record
const file = await repo.create({ user_id, original_filename, sha256_hash });

// Look up by ID
const file = await repo.findById(file_id);

// Get all files for a user (paginated)
const files = await repo.findByUserId(user_id, { limit: 10, offset: 0 });

// Deduplication check
const existing = await repo.findByHash(sha256_hash);

// Update after scan
await repo.markClean(file_id,    { scanner_version, download_path });
await repo.markInfected(file_id, { virus_name, scanner_version, quarantine_path });
await repo.markError(file_id,    { reason: 'clamd timeout' });
```

---

## Testing

Test scripts are included at the repo root:

```bash
# Test database connection & repository
node test-db.js

# Test the full infected-file pipeline
node test-infected.js

# Test WebSocket real-time events
node test-ws.js
```

---

## Security Notes

- All routes are protected by JWT middleware
- Uploaded files are **never served directly** — clean files require a fresh authenticated download request
- Infected files are moved to `/quarantine` and are never downloadable
- SHA-256 hashing prevents re-scanning identical files
- Rate limiting is applied to the upload endpoint via `express-rate-limit`
- `/quarantine` and `/storage` directories are excluded from version control via `.gitignore`

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Built with Node.js · React · PostgreSQL · ClamAV
</div>
