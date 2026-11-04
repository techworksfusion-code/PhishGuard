-- =============================================================
-- PhishGuard DB migration 001_init.sql
-- Applies core tables: users, otp_codes, sessions, urls, checks
-- See BACKEND_DESIGN.md §2 for the data dictionary and rules.
-- =============================================================

-- ACCOUNTS ------------------------------------------------------------
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(80)  NOT NULL,
    email           VARCHAR(254) UNIQUE,     -- NULL for phone-only accounts
    phone           VARCHAR(20)  UNIQUE,     -- NULL for email accounts
    password_hash   TEXT,                    -- NULL for phone-only accounts
    history_sync    BOOLEAN      NOT NULL DEFAULT FALSE,
    settings        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ              -- soft delete
);

ALTER TABLE users ADD CONSTRAINT users_has_contact
    CHECK (email IS NOT NULL OR phone IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT users_email_needs_password
    CHECK (email IS NULL OR password_hash IS NOT NULL);

-- ONE-TIME CODES --------------------------------------------------------
CREATE TABLE otp_codes (
    id           BIGSERIAL PRIMARY KEY,
    destination  VARCHAR(254) NOT NULL,     -- email address OR phone number
    code_hash    CHAR(64)     NOT NULL,     -- sha256(code + TOKEN_PEPPER)
    purpose      VARCHAR(12)  NOT NULL CHECK (purpose IN ('register','login')),
    attempts     SMALLINT     NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ  NOT NULL,     -- created_at + 10 minutes
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX otp_codes_dest_idx
    ON otp_codes (destination, purpose, expires_at DESC);

-- SESSIONS ---------------------------------------------------------------
CREATE TABLE sessions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64)    NOT NULL UNIQUE,   -- sha256(token + TOKEN_PEPPER)
    user_agent  VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,          -- created_at + 30 days
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

-- URLs (deduplicated by normalized hash) ----------------------------------
CREATE TABLE urls (
    id            BIGSERIAL PRIMARY KEY,
    url_hash      CHAR(64)     NOT NULL UNIQUE,  -- sha256(normalized URL)
    url           TEXT         NOT NULL,         -- normalized form
    host          VARCHAR(253) NOT NULL,         -- extracted hostname
    first_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX urls_host_idx ON urls (host);

-- CHECKS -------------------------------------------------------------------
CREATE TABLE checks (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,  -- NULL = anonymous
    url_id      BIGINT      NOT NULL REFERENCES urls(id),
    score       SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 100),
    verdict     VARCHAR(10) NOT NULL
                CHECK (verdict IN ('Low risk','Suspicious','Dangerous')),
    ai_status   VARCHAR(11) NOT NULL CHECK (ai_status IN ('ok','unavailable')),
    signals     JSONB       NOT NULL,   -- [{ "name", "points", "detail"}, ...]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX checks_user_idx ON checks (user_id, created_at DESC);
CREATE INDEX checks_url_idx  ON checks (url_id, created_at DESC);
CREATE INDEX checks_anon_idx ON checks (created_at) WHERE user_id IS NULL;
