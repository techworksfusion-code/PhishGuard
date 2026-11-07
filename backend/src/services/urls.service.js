'use strict';

const { db } = require('../db');

function findOrCreateUrl({ urlHash, normalizedUrl, host }) {
  let row = db.prepare('SELECT id FROM urls WHERE url_hash = ?').get(urlHash);
  if (row) {
    db.prepare('UPDATE urls SET last_seen_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE id = ?').run(row.id);
    return row.id;
  }
  const info = db.prepare(
    'INSERT INTO urls (url_hash, url, host) VALUES (?, ?, ?)'
  ).run(urlHash, normalizedUrl, host);
  return info.lastInsertRowid;
}

module.exports = { findOrCreateUrl };
