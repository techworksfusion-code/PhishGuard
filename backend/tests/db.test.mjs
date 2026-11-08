import test from 'node:test';
import assert from 'node:assert/strict';

// Must be set before importing anything that loads src/config.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';

const { db } = await import('../src/db/index.js');
const { migrate } = await import('../src/db/migrate.js');
const { findOrCreateUrl } = await import('../src/services/urls.service.js');
const { normalizeUrl } = await import('../src/utils/normalizeUrl.js');

test('migrations apply once, are idempotent, and keep FK enforcement', () => {
  const first = migrate();
  const second = migrate();
  const applied = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => row.version);

  assert.equal(first, 5);
  assert.equal(second, 0);
  assert.deepEqual(applied, [
    '001_init.sql',
    '002_threat_reports.sql',
    '003_alerts.sql',
    '004_google_auth.sql',
    '005_gemini_usage.sql',
  ]);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
});

test('findOrCreateUrl hashes, stores, and reuses a URL row', () => {
  const parsed = normalizeUrl('Example.COM/Path');
  const first = findOrCreateUrl({
    urlHash: parsed.hash,
    normalizedUrl: parsed.normalized,
    host: parsed.host,
  });
  const second = findOrCreateUrl({
    urlHash: parsed.hash,
    normalizedUrl: parsed.normalized,
    host: parsed.host,
  });

  assert.equal(first, second);
  const row = db.prepare('SELECT url, host, url_hash FROM urls WHERE id = ?').get(first);
  assert.equal(row.url, 'https://example.com/Path');
  assert.equal(row.host, 'example.com');
  assert.equal(row.url_hash, parsed.hash);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM urls').get().n, 1);
});
