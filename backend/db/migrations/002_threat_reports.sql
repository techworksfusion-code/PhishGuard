-- =============================================================
-- PhishGuard DB migration 002_threat_reports.sql  (SQLite)
-- Community threat reporting (BACKEND_DESIGN.md §2.3/§2.4, phase 2).
-- NOTE: SQLite has no materialized views. url_threat_stats is a plain
-- read-time view — aggregates are computed on query, no refresh job.
-- =============================================================

-- COMMUNITY VOTES -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS threat_votes (
    id          INTEGER PRIMARY KEY,
    url_id      INTEGER     NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    reporter_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    vote        VARCHAR(10) NOT NULL CHECK (vote IN ('dangerous','safe')),
    created_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (url_id, reporter_id)            -- one vote per account per URL
);

CREATE INDEX IF NOT EXISTS threat_votes_url_idx ON threat_votes (url_id);

-- AGGREGATE (read-time view; fine for the lab's traffic volume:
-- counts are cheap because url_id is indexed on both tables)
CREATE VIEW IF NOT EXISTS url_threat_stats AS
SELECT
    u.id    AS url_id,
    u.host  AS host,
    COALESCE(SUM(CASE WHEN v.vote = 'dangerous' THEN 1 ELSE 0 END), 0) AS dangerous_votes,
    COALESCE(SUM(CASE WHEN v.vote = 'safe'      THEN 1 ELSE 0 END), 0) AS safe_votes,
    MAX(v.created_at)                                                  AS last_voted_at
FROM urls u
LEFT JOIN threat_votes v ON v.url_id = u.id
GROUP BY u.id, u.host;
