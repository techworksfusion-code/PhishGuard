import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/index.js';
import { openDatabase } from './index.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../db/migrations');

export function migrate(db, directory = migrationsDirectory) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  const applied = db.prepare('SELECT name FROM schema_migrations WHERE name = ?');
  const record = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  const migrationFiles = fs.readdirSync(directory)
    .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
    .sort();

  for (const name of migrationFiles) {
    if (applied.get(name)) continue;
    const sql = fs.readFileSync(path.join(directory, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(name);
    })();
  }

  return migrationFiles;
}

function runMigrations() {
  const config = loadConfig();
  const db = openDatabase(config.databaseUrl);
  try {
    const migrations = migrate(db);
    console.info(`Database ready; ${migrations.length} migration(s) checked.`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations();
}
