'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const config = require('../config');

function resolveDbPath(databaseUrl) {
  const match = databaseUrl.match(/^sqlite:\/\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid DATABASE_URL: ${databaseUrl}. Expected sqlite://./path/to/db`);
  }
  const dbPath = match[1];
  if (dbPath === ':memory:') {
    return ':memory:';
  }
  const absolute = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return absolute;
}

const dbPath = resolveDbPath(config.databaseUrl);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function close() {
  db.close();
}

module.exports = { db, dbPath, close };
