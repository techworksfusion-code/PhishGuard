import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp({
  config: { corsOrigins: ['http://localhost:5173'] },
  logger: { info() {}, error() {} },
});

test('health endpoint returns the API readiness contract', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test('unknown routes return the JSON error contract', async () => {
  const response = await request(app).get('/api/missing');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Not found.' });
});

test('JSON body limit returns 413 with a JSON error', async () => {
  const response = await request(app)
    .post('/api/missing')
    .send({ value: 'x'.repeat(11 * 1024) });

  assert.equal(response.status, 413);
  assert.equal(typeof response.body.error, 'string');
});

test('CORS adds allow-origin only for configured browser origins', async () => {
  const allowed = await request(app)
    .get('/api/health')
    .set('Origin', 'http://localhost:5173');
  const denied = await request(app)
    .get('/api/health')
    .set('Origin', 'https://untrusted.example');

  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
