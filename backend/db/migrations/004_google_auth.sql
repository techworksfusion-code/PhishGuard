-- =============================================================
-- PhishGuard DB migration 004_google_auth.sql  (SQLite)
-- Adds Google sign-in columns to users and relaxes the check that
-- forced email accounts to have a password (Google accounts have
-- no local password). SQLite cannot ALTER a table constraint, so
-- the users table is rebuilt and its rows are preserved.
-- FK enforcement is temporarily off by the migration runner while
-- this script runs; a PRAGMA foreign_key_check validates integrity
-- afterwards.
-- =============================================================

CREATE TABLE users_new (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(80)  NOT NULL,
    email           VARCHAR(254) UNIQUE,     -- NULL for phone-only accounts
    phone           VARCHAR(20)  UNIQUE,     -- NULL for email accounts
    password_hash   TEXT,                    -- NULL for Google-only accounts
    google_sub      TEXT         UNIQUE,     -- stable Google 'sub' claim
    auth_provider   VARCHAR(12)  NOT NULL DEFAULT 'password',  -- 'password' | 'google' | 'password+google'
    history_sync    BOOLEAN      NOT NULL DEFAULT FALSE,
    settings        TEXT         NOT NULL DEFAULT '{}',    -- JSON document
    created_at      TEXT         NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_login_at   TEXT,
    deleted_at      TEXT,                                 -- soft delete
    CONSTRAINT users_has_contact
        CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CONSTRAINT users_email_needs_credential
        CHECK (email IS NULL OR password_hash IS NOT NULL OR google_sub IS NOT NULL)
);

INSERT INTO users_new
    (id, name, email, phone, password_hash, google_sub, auth_provider, history_sync, settings, created_at, last_login_at, deleted_at)
SELECT
    id, name, email, phone, password_hash, NULL, 'password', history_sync, settings, created_at, last_login_at, deleted_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
