import { createHash } from 'node:crypto';
import { normalizeUrl } from '../utils/normalizeUrl.js';

export function getOrCreateUrl(db, rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  const urlHash = createHash('sha256').update(normalized.url, 'utf8').digest('hex');

  return db.transaction(() => {
    db.prepare(`
      INSERT INTO urls (url_hash, url, host)
      VALUES (?, ?, ?)
      ON CONFLICT(url_hash) DO UPDATE SET
        last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(urlHash, normalized.url, normalized.host);

    const row = db.prepare(
      'SELECT id, url_hash, url, host, first_seen_at, last_seen_at FROM urls WHERE url_hash = ?',
    ).get(urlHash);

    return row;
  })();
}
