# Auth System Implementation

**Features:** Production-grade Register, Login, Token Refresh, Logout  
**Status:** Complete  
**Date:** 2026-07-13

---

## Security Threat Model

Before writing any code, every known auth attack vector was analysed and mitigated:

| Attack | Mitigation |
|--------|-----------|
| Plain-text password storage | bcrypt hash with cost factor 12 |
| Credential stuffing / brute force | Account lockout after 5 failures (30 min) + IP rate limit (5 req/15 min) |
| Account enumeration | Same error message for wrong email OR wrong password |
| Timing attacks | bcrypt.compare() dummy hash run even when user not found |
| XSS token theft | Access token stored in memory only (never localStorage) |
| CSRF attacks | Refresh token in HttpOnly + SameSite=Strict cookie |
| Token replay after logout | Refresh token hash stored in DB — revoked on logout |
| Stolen refresh token | Refresh token rotation — old token invalidated on every /refresh |
| Weak passwords | Enforced complexity rules (upper, lower, digit, special, 8+ chars) |
| Missing security headers | Helmet.js adds X-Content-Type, X-Frame-Options, etc. |
| Unthrottled login | Strict auth rate limiter: 5 requests / 15 min per IP |

---

## Architecture: Two-Token System

```
┌─────────────┐                              ┌─────────────────────┐
│   Browser   │                              │      API Server      │
│             │  POST /auth/login            │                      │
│             │ ─────────────────────────►  │  verify password     │
│             │                              │  bcrypt.compare()    │
│             │  ◄─────────────────────────  │                      │
│  access_token (15 min) ← JSON body        │  issue access token  │
│  refresh_token (7 days) ← HttpOnly cookie │  issue refresh token │
│             │                              │  store token HASH    │
│             │                              │  in DB (not the raw  │
│  [memory]   │                              │  token itself)       │
│  access_token → Authorization header      │                      │
│             │                              │                      │
│  [cookie]   │  POST /auth/refresh          │                      │
│  refresh ───│─────────────────────────►   │  verify token hash   │
│             │  ◄─────────────────────────  │  rotate: issue NEW   │
│  new access │                              │  access + refresh    │
│             │                              │  old token revoked   │
└─────────────┘                              └─────────────────────┘
```

**Why two tokens?**
- Access token: short-lived (15 min) — minimises damage if intercepted
- Refresh token: long-lived (7 days) — stored securely in HttpOnly cookie, invisible to JS, allows silent session restore on page refresh

---

## Files Added / Modified

### Backend

| File | Change |
|------|--------|
| `shared/src/db/migrations/20240102000000_create_users_table.js` | New — users table with lockout + refresh token columns |
| `shared/src/db/UserRepository.js` | New — full data-access layer for users table |
| `shared/src/index.js` | Modified — exports UserRepository |
| `api/src/routes/auth.js` | Replaced — real register, login, refresh, logout, /me |
| `api/src/middleware/rateLimiter.js` | Modified — added authLimiter (5 req/15 min) |
| `api/src/config.js` | Modified — JWT refresh secret, access/refresh expiry, bcrypt cost |
| `api/src/app.js` | Modified — helmet + cookie-parser middleware |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/services/api.js` | Replaced — access token in memory, auto-refresh interceptor |
| `frontend/src/context/AuthContext.jsx` | Replaced — register(), silent session restore, secure logout |
| `frontend/src/pages/LoginPage.jsx` | Replaced — tab toggle login/register, strength meter, requirements checklist |

### Packages Installed

```bash
# API
bcryptjs       — password hashing (pure JS, no native deps)
helmet         — HTTP security headers
validator      — email format validation
cookie-parser  — parse HttpOnly refresh token cookie

# Already installed, reused
jsonwebtoken   — JWT signing/verification
```

---

## Database Schema: `users` Table

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID | Primary key |
| `email` | TEXT UNIQUE | Normalised to lowercase |
| `password_hash` | TEXT | bcrypt hash, cost 12 |
| `display_name` | TEXT | Optional |
| `email_verified` | BOOLEAN | Prepared for email verification flow |
| `failed_login_attempts` | INTEGER | Reset on successful login |
| `locked_until` | TIMESTAMPTZ | NULL = not locked |
| `refresh_token_hash` | TEXT | SHA-256 of raw token (not the token itself) |
| `refresh_token_expires_at` | TIMESTAMPTZ | 7 days from issue |
| `last_login_at` | TIMESTAMPTZ | Audit trail |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

---

## API Endpoints

### POST /auth/register

Creates a new account.

**Request:**
```json
{
  "email": "jane@example.com",
  "password": "Secure#Pass1",
  "display_name": "Jane Smith"
}
```

**Response (201):**
```json
{
  "message": "Account created successfully.",
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": { "userId": "...", "email": "jane@example.com", "display_name": "Jane Smith" }
}
```

**Password requirements:** 8+ chars, uppercase, lowercase, digit, special character.

---

### POST /auth/login

Authenticates with email and password.

**Request:**
```json
{ "email": "jane@example.com", "password": "Secure#Pass1" }
```

**Response (200):** Same shape as register.

**Security behaviours:**
- Returns `"Invalid email or password."` for BOTH wrong email and wrong password (no enumeration)
- Returns `AccountLocked` after 5 failed attempts (30 min lockout)

---

### POST /auth/refresh

Exchanges the refresh token cookie for a new access token. No request body required — the HttpOnly cookie is sent automatically.

**Response (200):**
```json
{ "access_token": "<new jwt>", "token_type": "Bearer", "expires_in": 900 }
```

---

### POST /auth/logout

Revokes the refresh token on the server, clears the cookie. Requires a valid access token.

---

### GET /auth/me

Returns the current user's profile. Requires a valid access token.

---

## Frontend Changes

### LoginPage

- Tab toggle between **Sign In** and **Register** — no separate route needed
- Live **password strength bar** (5 segments: Weak → Strong)
- **Requirements checklist** — each rule turns green as it's met
- **Show/Hide password** toggle button
- Client-side validation matches server rules exactly — fails fast before network call
- Clean error banner for rejected credentials

### AuthContext

- Access token stored in **React state (memory only)** — survives component re-renders but not hard refresh (that's what the refresh cookie is for)
- **Silent session restore** on app load — calls `/auth/refresh` using the cookie; if valid, user stays logged in seamlessly across hard refreshes
- `register()` function added alongside `login()`
- `logout()` calls the server to revoke the token before clearing local state

### api.js

- `withCredentials: true` — ensures the HttpOnly cookie is sent on all cross-origin requests
- **Auto-refresh interceptor** — on a 401 response, automatically calls `/auth/refresh`, retries the original request with the new token, and queues any concurrent requests that arrived during the refresh

---

## Password Policy

| Rule | Requirement |
|------|------------|
| Minimum length | 8 characters |
| Uppercase | At least 1 (A–Z) |
| Lowercase | At least 1 (a–z) |
| Digit | At least 1 (0–9) |
| Special character | At least 1 (!@#$%^&* etc.) |
| Maximum length | Implicitly limited by bcrypt (72 bytes) |

---

## Environment Variables Added

```env
JWT_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<64-char random hex>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
BCRYPT_COST=12
MAX_LOGIN_ATTEMPTS=5
LOCK_DURATION_MS=1800000
```

Generate production secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## How to Run

```bash
# 1. Run the new migration (creates users table)
npm run migrate

# 2. Restart the dev server
npm run dev

# 3. Test via Swagger UI
# → http://localhost:3000/api-docs
# Use POST /auth/register to create an account, then Authorize with the token

# 4. Test the frontend
# → http://localhost:5173/login
# Click "Register" tab, fill in the form
```

---

## Next Steps

| Feature | Description |
|---------|-------------|
| Email verification | Send confirmation email after register (Nodemailer) |
| Password reset | Forgot password flow with time-limited reset tokens |
| Audit logs | Log every auth event (register, login, logout, failed attempts) to DB |
