-- =============================================================
-- PhishGuard DB migration 001_init.sql  (SQLite)
-- Applies core tables: users, otp_codes, sessions, urls, checks
-- See BACKEND_DESIGN.md §2 for the data dictionary and rules.
-- Notes:
--   * INTEGER PRIMARY KEY is a rowid alias: auto-increments silently.
--   * Timestamps are TEXT in ISO-8601 UTC ((...,'now') defaults).
--   * The connection must run with foreign_keys = ON (enforced in
--     src/db/index.js); SQLite does not enforce FKs by default.
--   * Runs are idempotent via IF NOT EXISTS.
-- =============================================================

-- ACCOUNTS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(80)  NOT NULL,
    email           VARCHAR(254) UNIQUE,     -- NULL for phone-only accounts
    phone           VARCHAR(20)  UNIQUE,     -- NULL for email accounts
    password_hash   TEXT,                    -- NULL for phone-only accounts
    history_sync    BOOLEAN      NOT NULL DEFAULT FALSE,   -- 0/1
    settings        TEXT         NOT NULL DEFAULT '{}',    -- JSON document
    created_at      TEXT         NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_login_at   TEXT,
    deleted_at      TEXT,                                 -- soft delete
    CONSTRAINT users_has_contact
        CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CONSTRAINT users_email_needs_password
        CHECK (email IS NULL OR password_hash IS NOT NULL)
);

-- ONE-TIME CODES --------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
    id           INTEGER PRIMARY KEY,
    destination  VARCHAR(254) NOT NULL,     -- email address OR phone number
    code_hash    CHAR(64)     NOT NULL,     -- sha256(code + TOKEN_PEPPER)
    purpose      VARCHAR(12)  NOT NULL CHECK (purpose IN ('register','login')),
    attempts     SMALLINT     NOT NULL DEFAULT 0,
    expires_at   TEXT         NOT NULL,     -- created_at + 10 minutes
    consumed_at  TEXT,
    created_at   TEXT         NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS otp_codes_dest_idx
    ON otp_codes (destination, purpose, expires_at DESC);

-- SESSIONS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64)    NOT NULL UNIQUE,   -- sha256(token + TOKEN_PEPPER)
    user_agent  VARCHAR(200),
    created_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at  TEXT        NOT NULL,          -- created_at + 30 days
    revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- URLs (deduplicated by normalized hash) ----------------------------------
CREATE TABLE IF NOT EXISTS urls (
    id            INTEGER PRIMARY KEY,
    url_hash      CHAR(64)     NOT NULL UNIQUE,  -- sha256(normalized URL)
    url           TEXT         NOT NULL,         -- normalized form
    host          VARCHAR(253) NOT NULL,         -- extracted hostname
    first_seen_at TEXT         NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at  TEXT         NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS urls_host_idx ON urls (host);

-- CHECKS -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checks (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,  -- NULL = anonymous
    url_id      INTEGER     NOT NULL REFERENCES urls(id),
    score       SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
    verdict     VARCHAR(10) NOT NULL
                CHECK (verdict IN ('Low risk','Suspicious','Dangerous')),
    ai_status   VARCHAR(11) NOT NULL CHECK (ai_status IN ('ok','unavailable')),
    signals     TEXT        NOT NULL,   -- JSON array [{ "name", "points", "detail"}, ...]
    created_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS checks_user_idx
    ON checks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checks_url_idx
    ON checks (url_id, created_at DESC);
-- Partial index for the anonymous-row retention sweep (supported by SQLite)
CREATE INDEX IF NOT EXISTS checks_anon_idx
    ON checks (created_at) WHERE user_id IS NULL;
