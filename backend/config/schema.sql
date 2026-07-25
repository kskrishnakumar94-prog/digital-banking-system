-- ==========================================================
-- Digital Banking System - Relational Schema (PostgreSQL)
-- Enforces atomicity, referential integrity, and non-negative
-- balances via CHECK constraints + application-level transactions.
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name           VARCHAR(150) NOT NULL,
    email               VARCHAR(150) UNIQUE NOT NULL,
    phone               VARCHAR(20) UNIQUE,
    password_hash       TEXT NOT NULL,
    is_2fa_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    two_fa_secret       TEXT,                 -- encrypted TOTP secret
    failed_login_count  INT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    role                VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
    status              VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ACCOUNTS ----------
CREATE TABLE IF NOT EXISTS accounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number      VARCHAR(20) UNIQUE NOT NULL,
    account_type        VARCHAR(20) NOT NULL DEFAULT 'savings' CHECK (account_type IN ('savings','checking','fixed_deposit')),
    nickname            VARCHAR(50),
    balance             NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    status              VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
    -- Fixed Deposit-only fields (NULL for savings/checking accounts)
    interest_rate       NUMERIC(5,2),           -- annual %, e.g. 6.50
    maturity_date       TIMESTAMPTZ,
    principal_amount    NUMERIC(18,2),          -- original amount locked in at FD open time
    source_account_id   UUID REFERENCES accounts(id), -- account the FD was funded from
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent column additions, so re-running this file against an existing
-- database (created before these columns existed) upgrades it in place
-- instead of erroring out.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5,2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS maturity_date TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(18,2);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS source_account_id UUID REFERENCES accounts(id);

-- Widen the account_type CHECK constraint to include 'fixed_deposit' even on
-- databases that already had the old (narrower) constraint.
DO $$
BEGIN
    ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
    ALTER TABLE accounts ADD CONSTRAINT accounts_account_type_check
        CHECK (account_type IN ('savings','checking','fixed_deposit'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- ---------- REFRESH TOKENS (session management) ----------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    user_agent      TEXT,
    ip_address      VARCHAR(45),
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ---------- TRANSACTIONS ----------
-- Every fund movement is one row per account side (double-entry),
-- linked by transfer_id, so a single transfer = 2 rows created
-- atomically in one DB transaction (see transferController.js).
CREATE TABLE IF NOT EXISTS transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id         UUID NOT NULL,          -- groups debit+credit pair
    account_id          UUID NOT NULL REFERENCES accounts(id),
    counterparty_account_id UUID REFERENCES accounts(id),
    type                VARCHAR(10) NOT NULL CHECK (type IN ('debit','credit')),
    amount              NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    balance_after       NUMERIC(18,2) NOT NULL CHECK (balance_after >= 0),
    description         VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','flagged')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_id ON transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- ---------- LOGIN ATTEMPTS (fraud/security logging) ----------
CREATE TABLE IF NOT EXISTS login_attempts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    email_attempted VARCHAR(150),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    success         BOOLEAN NOT NULL,
    reason          VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);

-- ---------- FRAUD ALERTS ----------
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    related_txn_id  UUID REFERENCES transactions(id),
    alert_type      VARCHAR(50) NOT NULL,   -- e.g. LARGE_AMOUNT, VELOCITY, LOGIN_BRUTE_FORCE, NEW_DEVICE
    severity        VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
    details         JSONB,
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_id ON fraud_alerts(user_id);

-- ---------- AUDIT LOG (general system log) ----------
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    ip_address      VARCHAR(45),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ---------- IDEMPOTENCY KEYS (safe request retries for money movement) ----------
-- Lets a client safely retry a POST (e.g. after a timeout on a flaky mobile
-- network) without risking a duplicate transfer. See middleware/idempotency.js
-- for the request/response lifecycle this table supports.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(200) NOT NULL,
    endpoint        VARCHAR(200) NOT NULL,
    status_code     INT,              -- NULL while the original request is still in flight
    response_body   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);

-- ---------- BENEFICIARIES (saved payees for quick transfers) ----------
CREATE TABLE IF NOT EXISTS beneficiaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname            VARCHAR(50) NOT NULL,
    account_number      VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_number)
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_id ON beneficiaries(user_id);

-- ---------- SCHEDULED / RECURRING TRANSFERS ----------
CREATE TABLE IF NOT EXISTS scheduled_transfers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_account_id     UUID NOT NULL REFERENCES accounts(id),
    to_account_number   VARCHAR(20) NOT NULL,
    amount              NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    description         VARCHAR(255),
    frequency           VARCHAR(20) NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','weekly','monthly')),
    next_run_at         TIMESTAMPTZ NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','completed')),
    last_run_at         TIMESTAMPTZ,
    last_run_status     VARCHAR(20),  -- 'success' | 'failed', set after each execution attempt
    -- Consecutive failed attempts since the last success. The scheduler
    -- auto-pauses a job (and notifies the owner) once this hits
    -- MAX_SCHEDULED_TRANSFER_FAILURES, instead of retrying a broken job
    -- forever (e.g. an account that's been closed).
    consecutive_failures INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scheduled_transfers ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_user_id ON scheduled_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_next_run ON scheduled_transfers(next_run_at) WHERE status = 'active';
