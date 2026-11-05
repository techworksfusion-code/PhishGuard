import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/index.js';

test('loadConfig requires a Gemini API key', () => {
  assert.throws(
    () => loadConfig({ GEMINI_API_KEY: '' }),
    /GEMINI_API_KEY is required/,
  );
});

test('loadConfig validates and normalizes startup settings', () => {
  const config = loadConfig({
    GEMINI_API_KEY: 'test-key',
    PORT: '5050',
    DATABASE_URL: 'sqlite://./data/test.db',
    CORS_ORIGINS: 'https://app.example, http://localhost:5173',
  });

  assert.equal(config.port, 5050);
  assert.equal(config.databaseUrl, 'sqlite://./data/test.db');
  assert.deepEqual(config.corsOrigins, ['https://app.example', 'http://localhost:5173']);
});

test('loadConfig rejects invalid ports and CORS values', () => {
  assert.throws(
    () => loadConfig({ GEMINI_API_KEY: 'test-key', PORT: '70000' }),
    /PORT must be an integer/,
  );
  assert.throws(
    () => loadConfig({ GEMINI_API_KEY: 'test-key', CORS_ORIGINS: 'https://app.example/path' }),
    /must be HTTP\(S\) origins/,
  );
});
