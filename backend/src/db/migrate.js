'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('./index');

const migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');

function listMigrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function ensureMetaTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `).run();
}

function isApplied(version) {
  const row = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  return !!row;
}

function markApplied(version) {
  db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
}

function applyFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');

  // Some migrations (e.g. 004_google_auth.sql) must temporarily disable FK
  // enforcement to rebuild a table. Enforcement is restored right after,
  // and the whole file is applied atomically; integrity is verified below.
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`BEGIN;
${sql}
COMMIT;`);
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch { /* already rolled back */ }
    throw err;
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const violations = db.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`Migration ${path.basename(filePath)} left FK violations: ${JSON.stringify(violations)}`);
  }
}

function migrate() {
  ensureMetaTable();
  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log('[migrate] No migration files found.');
    return 0;
  }
  let applied = 0;
  for (const file of files) {
    if (isApplied(file)) continue;
    const filePath = path.join(migrationsDir, file);
    applyFile(filePath);
    markApplied(file);
    applied += 1;
    console.log(`[migrate] Applied: ${file}`);
  }
  if (applied === 0) {
    console.log('[migrate] All migrations already applied.');
  } else {
    console.log(`[migrate] ${applied} migration(s) applied.`);
  }
  return applied;
}

module.exports = { migrate };

if (require.main === module) {
  migrate();
}
