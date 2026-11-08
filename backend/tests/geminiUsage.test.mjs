import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';

const { migrate } = await import('../src/db/migrate.js');
const { reserveGeminiCall, getGeminiUsage } = await import('../src/services/geminiUsage.service.js');

migrate();

test('reserves calls up to the daily cap and then refuses', () => {
  const day = '2026-01-01';

  assert.deepEqual(reserveGeminiCall({ day, max: 2 }), { allowed: true, calls: 1, max: 2 });
  assert.deepEqual(reserveGeminiCall({ day, max: 2 }), { allowed: true, calls: 2, max: 2 });
  assert.deepEqual(reserveGeminiCall({ day, max: 2 }), { allowed: false, calls: 2, max: 2 });
  assert.deepEqual(getGeminiUsage(day), { day, calls: 2 });
});

test('a new UTC day starts with a fresh budget', () => {
  assert.deepEqual(
    reserveGeminiCall({ day: '2026-01-02', max: 1 }),
    { allowed: true, calls: 1, max: 1 }
  );
});

test('max=0 blocks every call and invalid budgets are rejected', () => {
  assert.deepEqual(
    reserveGeminiCall({ day: '2026-01-03', max: 0 }),
    { allowed: false, calls: 0, max: 0 }
  );
  assert.throws(() => reserveGeminiCall({ day: '2026-01-03', max: -1 }), RangeError);
  assert.throws(() => reserveGeminiCall({ day: '2026-01-03', max: 'abc' }), RangeError);
});
