import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictForScore } from '../src/utils/verdict.js';

test('verdict bands use the documented inclusive boundaries', () => {
  assert.equal(verdictForScore(0), 'Low risk');
  assert.equal(verdictForScore(29), 'Low risk');
  assert.equal(verdictForScore(30), 'Suspicious');
  assert.equal(verdictForScore(59), 'Suspicious');
  assert.equal(verdictForScore(60), 'Dangerous');
  assert.equal(verdictForScore(100), 'Dangerous');
});

test('verdictForScore rejects scores outside the supported range', () => {
  assert.throws(() => verdictForScore(-1), RangeError);
  assert.throws(() => verdictForScore(101), RangeError);
  assert.throws(() => verdictForScore(30.5), RangeError);
});
