ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN whatsapp_jid TEXT;

CREATE TABLE IF NOT EXISTS analysis_jobs (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_id        INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    rule_score      SMALLINT NOT NULL CHECK (rule_score BETWEEN 0 AND 100),
    client_ref      TEXT NOT NULL UNIQUE,
    external_job_id TEXT UNIQUE,
    status          TEXT NOT NULL CHECK (status IN ('queued','running','done','error')),
    result_json     TEXT,
    report_pdf      BLOB,
    delivery_status TEXT NOT NULL DEFAULT '{}',
    error           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS analysis_jobs_user_idx
    ON analysis_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_jobs_check_idx
    ON analysis_jobs (check_id);

CREATE TABLE IF NOT EXISTS integration_link_codes (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel     TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp')),
    code_hash   TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    consumed_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS integration_link_codes_user_idx
    ON integration_link_codes (user_id, channel, created_at DESC);
