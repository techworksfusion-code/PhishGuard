import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyzer.js';
import { verdictFromScore } from '../src/utils/verdict.js';

test('flags a brand-impersonating scam link as dangerous', () => {
  const result = analyze('http://sbi-kyc-update.xyz/login');

  assert.ok(result.score >= 60, `expected >= 60, got ${result.score}`);
  assert.equal(verdictFromScore(result.score), 'Dangerous');
  assert.ok(result.signals.length > 0);
});

test('keeps a plain public link at low risk', () => {
  const result = analyze('https://example.com');

  assert.ok(result.score < 30, `expected < 30, got ${result.score}`);
  assert.equal(verdictFromScore(result.score), 'Low risk');
});

test('rejects malformed input', () => {
  assert.throws(() => analyze('not a website'), /Invalid URL/);
});
