-- =============================================================
-- PhishGuard DB migration 002_threat_reports.sql
-- Community threat reporting (BACKEND_DESIGN.md §2.3/§2.4, phase 2).
-- =============================================================

-- COMMUNITY VOTES -----------------------------------------------------------
CREATE TABLE threat_votes (
    id          BIGSERIAL PRIMARY KEY,
    url_id      BIGINT      NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    reporter_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    vote        VARCHAR(10) NOT NULL CHECK (vote IN ('dangerous','safe')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (url_id, reporter_id)            -- one vote per account per URL
);

CREATE INDEX threat_votes_url_idx ON threat_votes (url_id);

-- AGGREGATE (refresh every 5 min: REFRESH MATERIALIZED VIEW CONCURRENTLY)
CREATE MATERIALIZED VIEW url_threat_stats AS
SELECT
    u.id    AS url_id,
    u.host  AS host,
    count(*) FILTER (WHERE v.vote = 'dangerous') AS dangerous_votes,
    count(*) FILTER (WHERE v.vote = 'safe')      AS safe_votes,
    max(v.created_at)                            AS last_voted_at
FROM urls u
LEFT JOIN threat_votes v ON v.url_id = u.id
GROUP BY u.id, u.host;

CREATE UNIQUE INDEX url_threat_stats_url_idx ON url_threat_stats (url_id);
