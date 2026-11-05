import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { getOrCreateUrl } from '../src/services/urls.service.js';

test('migrations are recorded and safely re-run', () => {
  const db = openDatabase('sqlite://:memory:');
  try {
    const firstRun = migrate(db);
    const secondRun = migrate(db);
    const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all();

    assert.deepEqual(firstRun, [
      '001_init.sql',
      '002_threat_reports.sql',
      '003_alerts.sql',
    ]);
    assert.deepEqual(secondRun, firstRun);
    assert.equal(applied.length, 3);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    db.close();
  }
});

test('URL service normalizes, hashes, and reuses an existing URL row', () => {
  const db = openDatabase('sqlite://:memory:');
  try {
    migrate(db);
    const first = getOrCreateUrl(db, 'Example.COM/Path');
    const second = getOrCreateUrl(db, 'https://example.com/Path');

    assert.equal(first.id, second.id);
    assert.equal(first.url, 'https://example.com/Path');
    assert.equal(first.host, 'example.com');
    assert.match(first.url_hash, /^[a-f\d]{64}$/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM urls').get().count, 1);
  } finally {
    db.close();
  }
});
