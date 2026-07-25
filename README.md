# 🏦 Digital Banking System (Full Stack)

[![CI](https://github.com/kskrishnakumar94-prog/digital-banking-system/actions/workflows/ci.yml/badge.svg)](https://github.com/kskrishnakumar94-prog/digital-banking-system/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A full-stack digital banking web application built with **React**, **Node.js/Express**, and **PostgreSQL**.

> **New to this repo?** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design decisions behind the atomicity/idempotency/auth model, and an honest list of what's still missing for real production use (scaling gaps, compliance, monitoring). It's written to be the first thing a reviewer or interviewer reads.
>
## Features

| Requirement | Implementation |
|---|---|
| **User Authentication & Authorization** | JWT access tokens + httpOnly refresh token cookies, bcrypt password hashing, account lockout after repeated failures, role-based access (`customer`/`admin`) |
| **2-Factor Authentication (2FA)** | TOTP-based (Google Authenticator/Authy compatible) via `speakeasy`, QR code enrollment, enforced on login |
| **Session Management** | Short-lived JWT access tokens (15 min) + long-lived refresh tokens stored (hashed) in DB, revocable, auto-refresh on the frontend |
| **Account Management** | Dashboard with balance-distribution chart, multi-account support, balance inquiry, paginated transaction history, CSV statement export |
| **Multiple Account Types** | Savings, Checking, and **Fixed Deposits** (tiered interest rate by tenure, funded atomically from an existing account, matures automatically) |
| **Fund Transfer System** | Peer-to-peer transfers by account number, automatic debit/credit, saved **Beneficiaries** for quick-send, input validation |
| **Scheduled & Recurring Transfers** | Schedule a one-time future transfer, or a weekly/monthly recurring one, executed by a background worker using the same atomic transfer logic as instant transfers |
| **Database Atomicity** | PostgreSQL transactions (`BEGIN/COMMIT/ROLLBACK`) with row-level locking (`SELECT ... FOR UPDATE`) so a transfer is fully all-or-nothing — no partial debits/credits, even under concurrent load |
| **Idempotency Keys** | `POST /transfers` supports an `Idempotency-Key` header so a client retry (e.g. after a mobile timeout) safely replays the original result instead of executing a duplicate transfer — see `ARCHITECTURE.md` §3 |
| **Audit Logging** | Every significant action (registration, login, transfers, 2FA/password changes, admin status changes) is recorded in `audit_logs` and viewable via a paginated admin endpoint |
| **Fraud Detection/Logging** | Flags large transactions, high-velocity transfers, brute-force login attempts, and new-device logins; all login attempts and fraud alerts are logged to the DB and viewable in-app |
| **Email/SMS Alerting** | Auto-notifies users by email (and SMS, optional) on large transactions, velocity/brute-force flags, new-device logins, 2FA changes, password changes, and transfer receipts — with a safe console fallback if no SMTP/SMS provider is configured |
| **Admin Dashboard** | Role-gated `/admin` UI: system-wide stats, searchable user list with suspend/reactivate, and a fraud alert queue with resolve actions |
| **CI/CD & Code Quality** | GitHub Actions runs ESLint + the full test suite against a real Postgres service container on every push, plus a real `npm run build` of the frontend; ESLint + Prettier configs included |
| **Startup Safety** | The server validates required env vars on boot and refuses to start with a clear error rather than failing unpredictably later; a `/api/health/deep` endpoint verifies actual DB connectivity for real uptime monitoring |
| **Rate-Limit Tuning** | Every threshold is env-configurable; login uses a failed-attempts-only cap plus progressive slow-down, 2FA verification has its own tight limiter, and transfers/API calls are separately capped |
| **Profile & Security Self-Service** | Update name/phone, change password (with email confirmation), rename accounts |
| **Modern UI** | Sidebar + topbar layout, balance-distribution chart, account type badges, beneficiary quick-send chips, fully responsive down to mobile |

---

## Project Structure

```
digital-banking-system/
├── .github/workflows/ci.yml  # CI: backend lint+test against real Postgres, frontend build
├── .vscode/               # Debug configs, tasks, recommended extensions
├── ARCHITECTURE.md        # Design decisions + honest known limitations - read this first
├── LICENSE                # MIT
├── backend/
│   ├── config/            # DB connection, schema.sql, migrate + seed scripts,
│   │                      # validateEnv.js (fail-fast startup checks)
│   ├── controllers/       # Business logic (auth, accounts, transfers, fraud, admin,
│   │                      # beneficiaries, scheduled transfers)
│   ├── middleware/        # Auth guard, tunable rate limiting, validation, error handler,
│   │                      # idempotency.js (safe transfer retries)
│   ├── models/            # Data access layer (SQL queries), incl. auditLogModel.js
│   ├── routes/            # Express route definitions
│   ├── services/          # transferService.js - shared atomic transfer logic used by
│   │                      # both the HTTP endpoint and the scheduled-transfer worker
│   ├── tests/             # Dependency-free unit tests (node --test)
│   ├── utils/             # Logger, JWT helpers, fraud detection, notifications,
│   │                      # templates, background scheduler, auditLog.js
│   ├── .eslintrc.json / .prettierrc.json
│   ├── postman_collection.json
│   ├── Dockerfile
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Sidebar, Topbar, AppLayout, ProtectedRoute, AdminRoute
│   │   ├── context/       # AuthContext (global auth state)
│   │   ├── pages/         # Login, Register, Dashboard, Accounts, Transfer,
│   │   │                  # ScheduledTransfers, Beneficiaries, Security, Profile,
│   │   │                  # Alerts, AdminDashboard, AdminUsers, AdminAlerts
│   │   ├── services/api.js # Axios instance w/ auto token refresh
│   │   └── App.js
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml     # Full stack: Postgres + backend + frontend
└── README.md
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or Docker)
- VS Code (recommended extensions: ESLint, PostgreSQL by Chris Kolkman)

---

## Setup Instructions (VS Code)

### 1. Open the project
Open the `digital-banking-system` folder in VS Code (`File > Open Folder`).

### 2. Start PostgreSQL

**Option A — Docker (easiest):**
```bash
docker-compose up -d
```

**Option B — Local PostgreSQL install:**
Create a database manually:
```sql
CREATE DATABASE digital_banking;
```

### 3. Backend setup
Open a VS Code terminal (`` Ctrl+` ``):
```bash
cd backend
cp .env.example .env
```
Edit `.env` and set your real `DB_PASSWORD`, and **generate strong random secrets** for `JWT_SECRET` / `JWT_REFRESH_SECRET`, e.g.:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Install dependencies and run migrations:
```bash
npm install
npm run migrate
```

Start the API server:
```bash
npm run dev
```
The API will run at `http://localhost:5000`. Test it: `http://localhost:5000/api/health`

### 4. Frontend setup
Open a **second terminal** in VS Code:
```bash
cd frontend
npm install
npm start
```
The React app opens at `http://localhost:3000`.

### 5. (Optional) Seed demo data
Instead of registering manually, load ready-made demo accounts:
```bash
cd backend
npm run seed
```
This creates:
| Email | Password | Role | Starting Balance |
|---|---|---|---|
| alice@example.com | Password123 | customer | 150,000 |
| bob@example.com | Password123 | customer | 75,000 |
| admin@example.com | Password123 | admin | 0 |

### 6. Try it out
1. Register a new account at `/register` (a savings account is auto-created) — or use a seeded demo account above.
2. Log in at `/login`.
3. Go to **Security** and enable 2FA by scanning the QR code with Google Authenticator, then log out/in to see the 2FA challenge.
4. Go to **Transfer**, and send funds to another registered user's account number (e.g. transfer from Alice to Bob).
5. Check **Dashboard** for updated balance/history, and **Alerts** for fraud/login logs.
6. Log in as `admin@example.com` and open the **Admin** link in the navbar to see system-wide stats, manage users, and resolve fraud alerts.

---

## New: Account Types, Beneficiaries, Scheduled Transfers & Redesign

### Fixed Deposit accounts
From **Accounts → Open Fixed Deposit**, pick a source account, a principal amount, and a tenure (3–36 months). The principal is debited from the source account and the new FD account is created and funded **atomically** (same locking pattern as a regular transfer — see `AccountModel.openFixedDeposit`). Interest rate is assigned automatically by a tiered schedule (longer tenure = higher rate). FD accounts can't be selected as a transfer source, since they're meant to stay locked until maturity.

### Beneficiaries
Save frequent recipients under **Beneficiaries** with a nickname. On the **Transfer** page, saved beneficiaries appear as quick-select chips, and you can save a new recipient directly from the transfer form via the "Save this recipient as a beneficiary" checkbox.

### Scheduled & recurring transfers
From **Scheduled Transfers**, set up a transfer to run once at a future date, or weekly/monthly. A lightweight background worker (`backend/utils/scheduler.js`, started from `server.js`) checks every 60 seconds (configurable via `SCHEDULER_INTERVAL_MS`) for due transfers and executes them through the exact same atomic transfer logic used by the instant `/transfers` endpoint (`backend/services/transferService.js`) — so scheduled transfers get the same locking guarantees, fraud checks, and receipt notifications as manual ones. A failed run (e.g. insufficient funds at execution time) is logged and retried on the next cycle rather than silently dropped.

### Statement export
Every account has a **Download Statement (CSV)** button, exporting up to the most recent 1,000 transactions.

### Profile & security self-service
The **Profile** page lets a user update their name/phone and change their password (current password required; a confirmation email is sent on change).

### Redesign
The frontend now uses a persistent **sidebar + topbar** layout (collapsible on mobile), a balance-distribution chart on the dashboard (via `recharts`), account-type icons (via `lucide-react`), beneficiary quick-send chips, and a consistent design-token-based stylesheet (`frontend/src/styles.css`) instead of the earlier single-page navbar layout.

**New dependencies to install:** `recharts` and `lucide-react` are now in `frontend/package.json` — just run `npm install` in `frontend/` as usual, no extra steps needed.

**Database migration:** if you already ran `npm run migrate` before this update, just run it again — `schema.sql` uses idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements, so re-running it upgrades your existing database in place without data loss.

---

## Alternative: Run Everything with Docker

Instead of steps 3–6 above, spin up Postgres + backend + frontend together:
```bash
docker-compose up -d --build
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed   # optional demo data
```
Frontend: `http://localhost:3000` · Backend: `http://localhost:5000`

Stop everything: `docker-compose down` (add `-v` to also wipe the DB volume).

---

## Email / SMS Alerting

Every fraud alert, 2FA status change, and completed transfer sends a notification to the affected user — by email always, and by SMS if you enable it and the user has a phone number on file. **Nothing needs to be configured for this to work in dev**: if `SMTP_HOST` is blank, emails are written to the console/log instead of failing, and SMS defaults to the same console fallback.

To wire up real delivery, edit `backend/.env`:

| Variable | Purpose |
|---|---|
| `EMAIL_ALERTS_ENABLED` | Master on/off switch for email (default `true`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Your mail provider's SMTP credentials (e.g. SendGrid, Mailgun, or a Gmail app password) |
| `SMS_ALERTS_ENABLED` | Master on/off switch for SMS (default `false`) |
| `SMS_PROVIDER` | `console` (default, zero setup) or `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Only needed if `SMS_PROVIDER=twilio` — also run `npm install twilio` in `/backend` first, since it's not a default dependency |
| `TRANSFER_RECEIPT_ENABLED` | Send a receipt to both parties after every transfer (default `true`) |

What triggers a notification:
- **Large transaction** — amount ≥ `LARGE_TXN_THRESHOLD`
- **Velocity alert** — too many transfers from one account in a short window
- **Brute-force lockout** — too many failed login attempts
- **New-device login** — first successful login from an IP not seen before on that account
- **2FA enabled/disabled**
- **Transfer receipt** — sent to both sender and receiver on every completed transfer

All of this is implemented in `backend/utils/notifications.js` (delivery) and `backend/utils/alertTemplates.js` (message copy), and hooked in from `fraudDetection.js`, `authController.js`, and `transferController.js`.

---

## Admin Dashboard

Any user with `role = 'admin'` (the seeded `admin@example.com` account, or one you promote manually via `UPDATE users SET role = 'admin' WHERE email = '...'`) sees an **Admin** link in the navbar leading to `/admin`:

- **Dashboard** (`/admin`) — total users, total accounts, total balance across the system, transfers today, unresolved fraud alerts, and currently-locked accounts, plus a feed of recent alerts.
- **Manage Users** (`/admin/users`) — searchable, paginated user list showing role, status, account count, total balance, and 2FA status, with one-click **Suspend**/**Activate** actions (an admin can't suspend their own account, and the affected user gets notified of the change).
- **Manage Alerts** (`/admin/alerts`) — every fraud alert system-wide, filterable to unresolved-only, with a **Mark Resolved** action.

Backend endpoints live under `/api/admin/*` (`adminController.js` / `adminRoutes.js`) and the existing `/api/fraud/admin/*` endpoints, all gated by `requireAuth` + `requireRole('admin')`.

---

## Rate-Limit Tuning

Every limiter is configurable via `.env` (see `backend/middleware/rateLimiter.js`) so you can loosen limits in staging and tighten them in production without touching code:

| Limiter | Default | Notes |
|---|---|---|
| Login (`/auth/login`) | 20 failed attempts / 15 min | Only **failed** attempts count (`skipSuccessfulRequests`) — a legitimate user logging in repeatedly is never penalized |
| Login slow-down | delay grows after 3 attempts / 15 min | Progressive backoff (500ms × attempt count, capped at 10s) layered in front of the hard cap, so automated brute-force gets throttled early |
| 2FA verification (`/auth/login/verify-2fa`, `/auth/2fa/confirm`) | 10 attempts / 15 min | Tighter than general auth since a 6-digit TOTP code has limited entropy |
| Transfers (`/transfers`) | 15 / 5 min | Tight cap since each request moves money |
| General API | 300 / 15 min | Broad ceiling across all routes, mainly to blunt scraping/abuse |

`server.js` also sets `app.set('trust proxy', TRUST_PROXY_HOPS)` (default `1`) so these limiters see the real client IP when running behind a reverse proxy (nginx, a cloud load balancer, etc.) instead of the proxy's own address. If you're hitting the backend directly with no proxy in front (e.g. local dev), set `TRUST_PROXY_HOPS=0`.

---

## Testing

### Automated unit tests (no DB required)
The backend includes a dependency-free test suite (Node's built-in test runner) covering account number generation, JWT issuance/verification, and the fraud detection engine's thresholds (large amount, velocity, login brute-force) via a mocked DB layer:
```bash
cd backend
npm install    # first time only
npm test
```

### Linting & formatting
```bash
cd backend
npm run lint     # ESLint
npm run format   # Prettier - auto-fixes formatting
```

### Continuous Integration
`.github/workflows/ci.yml` runs on every push/PR: the backend job lints, applies `schema.sql` to a real Postgres 16 service container, and runs the test suite; the frontend job runs a real `npm run build`. This is the first point where the frontend gets checked by an actual JSX-aware build toolchain — see `ARCHITECTURE.md` §6 for why that distinction matters for this project's history.

### Manual API testing
Import `backend/postman_collection.json` into Postman (or use the VS Code **REST Client** extension) to exercise every endpoint — register, login, 2FA, transfers, balance, history, and fraud alerts. Update the `baseUrl` and `accessToken` collection variables as you go.

### VS Code integration
The `.vscode/` folder includes:
- **`launch.json`** — one-click debug configs for the server, migration, seed script, and test suite (`Run and Debug` panel).
- **`tasks.json`** — quick tasks for installing dependencies and running migrations/seeds.
- **`extensions.json`** — recommended extensions (ESLint, Prettier, PostgreSQL explorer, REST Client, dotenv syntax highlighting).

---

## Idempotency Keys (safe transfer retries)

`POST /api/transfers` accepts an optional `Idempotency-Key` header. Generate a fresh UUID client-side once per logical transfer attempt, and send the same key on every retry of that same attempt:

```bash
curl -X POST http://localhost:5000/api/transfers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 3f29a1c4-8b1e-4e2a-9c3d-1a2b3c4d5e6f" \
  -d '{"fromAccountNumber":"...","toAccountNumber":"...","amount":100}'
```

Retrying that exact request with the same key — even minutes later — replays the original result instead of moving money twice. Full design rationale in `ARCHITECTURE.md` §3.

---

## How Atomicity Is Guaranteed

Every fund transfer (`transferController.js`) runs inside a single PostgreSQL transaction:

1. `BEGIN`
2. Both accounts are locked in a deterministic order using `SELECT ... FOR UPDATE` (prevents deadlocks + race conditions).
3. Balance is verified **after** the lock is acquired (not before), so two simultaneous transfers can't both pass a stale balance check.
4. Debit + credit rows are inserted as one linked `transfer_id` pair.
5. If **any** step fails (insufficient funds, constraint violation, network error, etc.), `ROLLBACK` is triggered automatically and **nothing** is persisted — the sender is never debited without the receiver being credited, or vice versa.
6. `COMMIT` only happens once every step succeeds.

Database-level `CHECK` constraints (`balance >= 0`, `amount > 0`) act as a second line of defense.

## How Fraud Detection Works

- **Large transaction alerts**: any transfer above `LARGE_TXN_THRESHOLD` (configurable in `.env`) is flagged.
- **Velocity checks**: too many debit transactions from one account within `VELOCITY_WINDOW_MINUTES` triggers a `VELOCITY` alert.
- **Login brute-force detection**: 5+ failed login attempts within 15 minutes both locks the account temporarily and raises a `LOGIN_BRUTE_FORCE` alert.
- All alerts are stored in the `fraud_alerts` table and login attempts in `login_attempts`, both viewable from the **Alerts** page.

## Security Notes / Production Checklist

- [ ] Rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` and never commit `.env`.
- [ ] Put the app behind HTTPS (required for secure cookies in production).
- [ ] Consider a managed Redis instance for the pending-2FA challenge store (currently in-memory — fine for demo, not for multi-instance production).
- [ ] Add email/SMS notifications for large transfers and new-device logins (SMTP config is stubbed in `.env.example`).
- [ ] Set up automated DB backups given this handles financial data.
