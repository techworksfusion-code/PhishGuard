import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Must be set before importing anything that loads src/config.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';
process.env.CORS_ORIGINS = 'https://guard.fusiontechworks.in,http://localhost:5173';

let server;
let baseUrl;

before(async () => {
  const { migrate } = await import('../src/db/migrate.js');
  const { createApp } = await import('../src/app.js');

  migrate();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => (server ? server.close(resolve) : resolve())));

async function call(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test('health endpoint returns the API readiness contract', async () => {
  const { response, body } = await call('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true });
});

test('unknown routes return the JSON error contract', async () => {
  const { response, body } = await call('/api/missing');

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: 'Not found' });
});

test('oversized JSON bodies return 413 with a JSON error', async () => {
  const { response, body } = await call('/api/missing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(11 * 1024) }),
  });

  assert.equal(response.status, 413);
  assert.equal(typeof body.error, 'string');
});

test('CORS only echoes allow-listed origins', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://untrusted.example' },
  });

  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('POST /api/check-link returns the documented contract', async () => {
  const { response, body } = await call('/api/check-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
  assert.equal(body.host, 'example.com');
  assert.match(body.urlHash, /^[a-f0-9]{64}$/);
  assert.equal(typeof body.score, 'number');
  assert.ok(['Low risk', 'Suspicious', 'Dangerous'].includes(body.verdict));
  assert.ok(Array.isArray(body.signals));
  assert.equal(body.ai, 'unavailable');
  assert.deepEqual(body.votes, { dangerous: 0, safe: 0, my: null });
  assert.equal(typeof body.checkId, 'number');
});
