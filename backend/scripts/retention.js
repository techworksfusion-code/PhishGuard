'use strict';

// Data retention per BACKEND_DESIGN.md §2.4.
// Run every 6 hours (registered in deployment/pm2/ecosystem.config.js
// with a cron_restart) — or manually: node scripts/retention.js

const path = require('path');
const { db } = require('../src/db');

const RULES = [
  {
    label: 'analysis_jobs (history_sync users, > 90 days)',
    sql: `DELETE FROM analysis_jobs
          WHERE user_id IN (SELECT id FROM users WHERE history_sync)
            AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')`
  },
  {
    label: 'analysis_jobs (non-sync users, > 24 h)',
    sql: `DELETE FROM analysis_jobs
          WHERE user_id IN (SELECT id FROM users WHERE NOT history_sync)
            AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')`
  },
  {
    label: 'checks (anonymous, > 7 days)',
    sql: `DELETE FROM checks
          WHERE user_id IS NULL
            AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')`
  },
  {
    label: 'checks (history_sync users, > 90 days)',
    sql: `DELETE FROM checks
          WHERE user_id IN (SELECT id FROM users WHERE history_sync)
            AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')`
  },
  {
    label: 'checks (non-sync users, > 24 h)',
    sql: `DELETE FROM checks
          WHERE user_id IN (SELECT id FROM users WHERE NOT history_sync)
            AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')`
  },
  {
    label: 'otp_codes (expired/consumed)',
    sql: `DELETE FROM otp_codes
          WHERE consumed_at IS NOT NULL
             OR expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  },
  {
    label: 'integration_link_codes (expired/consumed > 1 day)',
    sql: `DELETE FROM integration_link_codes
          WHERE (consumed_at IS NOT NULL
                 AND consumed_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'))
             OR expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')`
  },
  {
    label: 'sessions (revoked/expired > 1 day)',
    sql: `DELETE FROM sessions
          WHERE (revoked_at IS NOT NULL
                 AND revoked_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'))
             OR expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')`
  },
  {
    label: 'gemini_usage (> 7 days)',
    sql: `DELETE FROM gemini_usage
          WHERE day < strftime('%Y-%m-%d', 'now', '-7 days')`
  },
  {
    label: 'alert_events (> 30 days)',
    sql: `DELETE FROM alert_events
          WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`
  }
  // urls, threat_votes and the url_threat_stats view are kept:
  // aggregated, non-personal data (BACKEND_DESIGN.md §2.4).
];

function runRetention() {
  db.pragma('foreign_keys = ON');
  const purged = [];
  db.pragma('foreign_keys = OFF'); // partial deletes may leave FK entry points
  try {
    for (const rule of RULES) {
      const info = db.prepare(rule.sql).run();
      if (info.changes > 0) {
        purged.push(`${rule.label}: ${info.changes}`);
      }
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }

  // FK integrity must still hold after the purge.
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`FK violations after retention: ${JSON.stringify(violations)}`);
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  return purged;
}

if (require.main === module) {
  const purged = runRetention();
  if (purged.length === 0) {
    console.log(new Date().toISOString(), 'retention: nothing to purge');
  } else {
    for (const line of purged) {
      console.log(new Date().toISOString(), 'retention:', line);
    }
  }
}

module.exports = { runRetention };
