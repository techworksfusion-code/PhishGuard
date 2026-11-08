-- =============================================================
-- PhishGuard DB migration 005_gemini_usage.sql  (SQLite)
-- Per-day counter enforcing GEMINI_DAILY_MAX (M6 cost guard).
-- One row per UTC day; the retention job prunes rows > 7 days.
-- =============================================================

CREATE TABLE IF NOT EXISTS gemini_usage (
    day        TEXT PRIMARY KEY,              -- UTC date, YYYY-MM-DD
    calls      INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
