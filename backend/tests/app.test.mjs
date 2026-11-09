import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

// Must be set before importing anything that loads src/config.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';
process.env.WEBHOOK_SIGNING_SECRET = 'test-webhook-secret-with-sufficient-length';
process.env.CORS_ORIGINS = 'https://guard.fusiontechworks.in,http://localhost:5173';

let server;
let baseUrl;

const { db } = await import('../src/db/index.js');

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

  test('sandbox webhook verifies raw-body signatures before parsing callbacks', async () => {
    const { response, body } = await call('/api/webhooks/scan-done', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': `sha256=${'0'.repeat(64)}`,
        'X-Job-Id': 'job-1',
      },
      body: JSON.stringify({ job_id: 'job-1', client_ref: 'client-1', status: 'done' }),
    });

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Invalid sandbox callback signature.');
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

test('POST /api/scan-message returns a verdict and never stores the text', async () => {
  const marker = 'PAYLOAD-MARKER-9f3a';
  const senderHash = 'a'.repeat(64);

  const { response, body } = await call('/api/scan-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${marker} URGENT: your SBI account will be blocked. Share your OTP at http://sbi-kyc-update.xyz/login`,
      senderHash,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.valid, true);
  assert.ok(body.score >= 60, `expected >= 60, got ${body.score}`);
  assert.equal(body.verdict, 'Dangerous');
  assert.equal(body.ai, 'unavailable'); // placeholder key in tests
  assert.ok(body.signals.length > 0);
  assert.ok(body.signals.some((signal) => signal.source === 'rules'));
  assert.deepEqual(body.links, ['http://sbi-kyc-update.xyz/login']);
  assert.equal(body.ruleScore, 100);
  assert.equal(body.aiScore, null);
  assert.equal(typeof body.alertId, 'number');
  assert.equal(body.linkCount, 1);
  assert.deepEqual(body.dynamicAnalysis, {
    status: 'sign_in_required',
    reason: 'dynamic_analysis_requires_account',
  });

  const columns = db.prepare('PRAGMA table_info(alert_events)').all().map((c) => c.name);
  assert.ok(!columns.includes('text'));
  assert.ok(!columns.includes('body'));
  assert.ok(!columns.includes('message'));

  const row = db.prepare('SELECT * FROM alert_events WHERE id = ?').get(body.alertId);
  assert.equal(row.sender_hash, senderHash);
  assert.equal(row.link_count, 1);
  assert.ok(!JSON.stringify(row).includes(marker), 'SMS body must not be persisted');
});

test('POST /api/scan-message validates text and sender hash', async () => {
  const missing = await call('/api/scan-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missing.response.status, 400);

  const badSender = await call('/api/scan-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hello', senderHash: '+919876543210' }),
  });
  assert.equal(badSender.response.status, 422);
});

test('GET /api/alerts requires authentication', async () => {
  const { response } = await call('/api/alerts');
  assert.equal(response.status, 401);
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
  assert.deepEqual(body.dynamicAnalysis, { status: 'not_triggered', reason: 'rule_score_below_threshold' });
  assert.deepEqual(body.votes, { dangerous: 0, safe: 0, my: null });
  assert.equal(typeof body.checkId, 'number');
});
