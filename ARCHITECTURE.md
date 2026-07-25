# Architecture

This document explains the *why* behind the major design decisions in this
codebase, and is deliberately honest about what's still missing for a real
production deployment. A resume project that documents its own limitations
is more credible than one that implies it's finished — treat this file as
the thing to point an interviewer at.

## 1. High-level shape

```
┌─────────────┐      HTTPS       ┌──────────────┐      SQL      ┌────────────┐
│   React SPA │ ───────────────▶ │  Express API │ ─────────────▶│ PostgreSQL │
│ (frontend/) │ ◀─────────────── │  (backend/)  │ ◀─────────────│            │
└─────────────┘   JSON + cookie  └──────┬───────┘               └────────────┘
                                         │
                            in-process background worker
                            (utils/scheduler.js) - executes
                            due scheduled/recurring transfers
                                         │
                                         ▼
                              email/SMS providers (or
                              console fallback in dev)
```

A single Express process serves the REST API and also runs an in-process
`setInterval` worker for scheduled transfers (see §5 for why this is a
scaling limitation, not a strength).

## 2. Money movement: the atomicity guarantee

`backend/services/transferService.js` is the single place in the codebase
that moves money between two accounts. Both the HTTP `/transfers` endpoint
and the scheduled-transfer worker call this same function - there is
intentionally no second copy of this logic anywhere.

**The guarantee:** a transfer either fully happens (both the debit and the
credit are persisted) or fully doesn't (neither is). This is implemented
with:

1. A single Postgres transaction (`BEGIN...COMMIT`/`ROLLBACK`) wrapping the
   whole operation (`config/db.js`'s `withTransaction` helper).
2. `SELECT ... FOR UPDATE` row locks on both accounts, acquired in a
   **deterministic order** (sorted by account ID) - this is what prevents
   a classic deadlock where transfer A locks account 1 then waits for
   account 2, while transfer B (in the reverse direction) locks account 2
   then waits for account 1.
3. The balance check happens **after** the lock is acquired, not before -
   otherwise two concurrent transfers could both read "sufficient funds"
   before either has debited anything, double-spending the same balance.
4. Every transfer writes **two** rows to `transactions` (a debit and a
   credit) sharing a `transfer_id` - a double-entry style ledger, so the
   full picture of any transfer is reconstructable from the `transactions`
   table alone, independent of the current `accounts.balance` value.

## 3. Idempotency keys

`backend/middleware/idempotency.js` protects `POST /transfers` against a
duplicate request actually causing a duplicate transfer. This matters
because retries are routine in real client behavior (a mobile client on a
flaky connection that times out waiting for a response and retries the
same request) - without this, a retried request would execute a second,
identical transfer.

The client opts in with an `Idempotency-Key` header (any unique string,
typically a UUID generated once per logical operation). The implementation
follows the same pattern Stripe's API uses:
- First request with a given key: an `idempotency_keys` row is inserted
  with `status_code = NULL` ("in flight"), the request proceeds, and the
  eventual response is captured and stored against that key.
- A concurrent second request with the *same* key while the first is still
  running gets `409 Conflict` rather than racing the first request.
- A later retry with the same key, after the first has completed, gets the
  **stored response replayed** - the underlying transfer never runs twice.
- A row stuck "in flight" for over `IDEMPOTENCY_STALE_MS` (default 60s) is
  treated as abandoned (e.g. the server crashed mid-request) and a fresh
  attempt is allowed through, so a crash can't permanently brick that key.

## 4. Auth & session design

- **Access tokens** are short-lived JWTs (15 min default), stateless,
  verified on every request via `middleware/authMiddleware.js`.
- **Refresh tokens** are opaque random strings; only their SHA-256 hash is
  stored in the `refresh_tokens` table, so a stolen database dump doesn't
  hand out usable refresh tokens. They're delivered as an `httpOnly`
  cookie, not accessible to JavaScript (mitigates XSS token theft).
- **2FA** is standard TOTP (Google Authenticator/Authy compatible),
  enforced as a second step after password verification, before any token
  is issued.
- **Account lockout** and a fraud-detection layer (`utils/fraudDetection.js`)
  independently watch for brute-force login attempts, unusually large
  transfers, high-velocity transfers, and logins from a never-before-seen
  IP - each raising a row in `fraud_alerts` and (best-effort) notifying the
  affected user by email/SMS.

## 5. Known limitations & honest scaling gaps

These are the things a senior engineer reviewing this codebase would flag
first. Naming them here is more useful than hoping they don't get asked
about.

**Single-instance assumptions (would break under horizontal scaling):**
- The pending-2FA challenge store (`authController.js`'s `pendingTwoFA`
  Map) is in-memory. Run two API instances behind a load balancer and a
  user whose password-verify hit instance A but whose OTP-verify gets
  routed to instance B will fail, because instance B never saw the
  challenge. **Fix:** move this to Redis with a TTL.
- The scheduled-transfer worker (`utils/scheduler.js`) runs as an
  in-process `setInterval` on whichever instance happens to be running it.
  With two instances, the same due transfer could be picked up and
  executed by both simultaneously. **Fix:** either run the worker as a
  single dedicated process (not part of the web-serving fleet), or add a
  distributed lock (e.g. Postgres advisory locks, or a Redis lock) around
  each job before executing it.

**Missing for production, present in the schema but not fully load-bearing:**
- `audit_logs` is now written to (register, login, transfers, 2FA/password
  changes, admin actions) and readable via `GET /api/admin/audit-logs`, but
  there's no retention policy, export tooling, or tamper-evidence (e.g.
  hash chaining) that a real compliance audit trail would need.
- No idempotency protection on `POST /accounts/fixed-deposit` or
  `POST /scheduled-transfers` yet - only `/transfers` has it. The same
  `requireIdempotencyKey` middleware could be applied to those with
  minimal changes.

**Not attempted (explicitly out of scope for this project):**
- No KYC/AML flow, no sanctions screening, no regulatory reporting.
- No PCI-DSS scope - this system never handles card data.
- Secrets live in a plain `.env` file, not a secrets manager (Vault, AWS
  Secrets Manager, etc.) - fine for local dev, not for a real deployment.
- No monitoring/alerting stack (Prometheus/Grafana, Sentry, PagerDuty).
  `winston` logs to local files only.
- No load testing has been performed - the row-locking design *should*
  hold up under concurrent load (that's the point of the deterministic
  lock ordering), but "should" isn't "verified under load."
- No dependency vulnerability scanning (`npm audit` / Dependabot / Snyk)
  wired into CI yet.

## 6. What CI actually checks (`.github/workflows/ci.yml`)

- **Backend job:** installs dependencies, runs ESLint, applies the real
  `schema.sql` against a genuine Postgres 16 service container, then runs
  the unit test suite - so the migration itself is exercised on every
  push, not just the application code.
- **Frontend job:** installs dependencies and runs the real Create React
  App production build. This is the first point in this project's history
  where the frontend gets parsed by a real JSX-aware toolchain (Babel) -
  earlier development happened in a sandboxed environment without network
  access, so frontend correctness could only be checked by manual
  brace/tag-balancing, not a real build. If this workflow is green, that
  gap has been closed for whatever commit it ran on.

## 7. Suggested next steps, roughly in priority order

1. Move the 2FA challenge store to Redis (closes the biggest scaling gap).
2. Add a distributed lock (or dedicate a single worker process) for the
   scheduled-transfer runner.
3. Extend idempotency-key protection to the FD-opening and
   scheduled-transfer-creation endpoints.
4. Wire `npm audit` (or Dependabot) into CI.
5. Add integration tests that exercise `transferService.js` against a real
   Postgres instance under concurrent load, to empirically validate the
   deadlock-avoidance and no-double-spend claims in §2 rather than relying
   on code review alone.
