import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'test-key';

const configModule = await import('../src/config/index.js');
const { loadConfig } = configModule.default;

const baseEnv = {
  DATABASE_URL: 'sqlite://:memory:',
  TOKEN_PEPPER: 'token-pepper',
  ALERT_PEPPER: 'alert-pepper',
  GEMINI_API_KEY: 'test-key',
};

test('every required environment variable is enforced', () => {
  for (const name of ['DATABASE_URL', 'TOKEN_PEPPER', 'ALERT_PEPPER', 'GEMINI_API_KEY']) {
    const env = { ...baseEnv };
    delete env[name];
    assert.throws(() => loadConfig(env), new RegExp(name), name);
  }
});

test('normalizes ports, CORS origins and the Gemini budget', () => {
  const config = loadConfig({
    ...baseEnv,
    PORT: '5050',
    CORS_ORIGINS: 'https://app.example, http://localhost:5173',
    GEMINI_DAILY_MAX: '0',
  });

  assert.equal(config.port, 5050);
  assert.deepEqual(config.corsOrigins, ['https://app.example', 'http://localhost:5173']);
  assert.equal(config.geminiDailyMax, 0);
  assert.equal(config.geminiModel, 'gemini-3.5-flash-lite');
});

test('rejects invalid ports, CORS values and budgets', () => {
  assert.throws(() => loadConfig({ ...baseEnv, PORT: '70000' }), /PORT/);
  assert.throws(() => loadConfig({ ...baseEnv, PORT: 'abc' }), /PORT/);
  assert.throws(
    () => loadConfig({ ...baseEnv, CORS_ORIGINS: 'https://app.example/path' }),
    /CORS_ORIGINS/
  );
  assert.throws(() => loadConfig({ ...baseEnv, GEMINI_DAILY_MAX: '-1' }), /GEMINI_DAILY_MAX/);
});
