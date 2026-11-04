-- =============================================================
-- PhishGuard DB migration 003_alerts.sql
-- Real-time SMS protection events (REALTIME_PROTECTION_DESIGN.md).
-- PRIVACY: sender numbers and message text NEVER reach the server;
-- only sha256(sender) and, when present, the URL's url_id.
-- =============================================================

CREATE TABLE alert_events (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    url_id         BIGINT      REFERENCES urls(id) ON DELETE SET NULL,  -- NULL = message had no link
    sender_hash    CHAR(64)    NOT NULL,        -- sha256(sender + ALERT_PEPPER)
    link_count     SMALLINT    NOT NULL DEFAULT 0,
    local_verdict  VARCHAR(10),                 -- on-device rule result ('Low risk'|'Suspicious'|'Dangerous')
    score          SMALLINT    CHECK (score BETWEEN 0 AND 100),  -- server merged score
    verdict        VARCHAR(10) CHECK (verdict IN ('Low risk','Suspicious','Dangerous')),
    ai_status      VARCHAR(11) CHECK (ai_status IN ('ok','unavailable')),
    notified       BOOLEAN     NOT NULL DEFAULT FALSE,
    in_app_shown   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX alert_events_user_idx    ON alert_events (user_id, created_at DESC);
CREATE INDEX alert_events_url_idx     ON alert_events (url_id, created_at DESC);
CREATE INDEX alert_events_sweep_idx   ON alert_events (created_at);  -- 30-day retention sweep
