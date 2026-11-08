import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictFromScore } from '../src/utils/verdict.js';

test('verdict bands use the documented inclusive boundaries', () => {
  assert.equal(verdictFromScore(0), 'Low risk');
  assert.equal(verdictFromScore(29), 'Low risk');
  assert.equal(verdictFromScore(30), 'Suspicious');
  assert.equal(verdictFromScore(59), 'Suspicious');
  assert.equal(verdictFromScore(60), 'Dangerous');
  assert.equal(verdictFromScore(100), 'Dangerous');
});

test('verdictFromScore rejects scores outside the supported range', () => {
  for (const score of [-1, 101, 30.5, Number.NaN]) {
    assert.throws(() => verdictFromScore(score), RangeError);
  }
});
