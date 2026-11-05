import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function resolveDatabasePath(databaseUrl) {
  const databasePath = databaseUrl.slice('sqlite://'.length);
  if (!databasePath || databasePath.includes('\0')) {
    throw new Error('DATABASE_URL must contain a valid SQLite database path.');
  }
  if (databasePath === ':memory:') return databasePath;

  const resolvedPath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

export function openDatabase(databaseUrl) {
  const db = new Database(resolveDatabasePath(databaseUrl));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
