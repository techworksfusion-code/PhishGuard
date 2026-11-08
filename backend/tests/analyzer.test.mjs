import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeMessage, extractLinks } from '../src/analyzer.js';
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

test('extracts URLs and bare domains, skipping emails and duplicates', () => {
  const links = extractLinks(
    'Visit https://example.com/a, www.example.org or mail user@paytm.com. Call 9876543210.'
  );

  assert.ok(links.some((link) => link.includes('example.com/a')));
  assert.ok(links.some((link) => link.includes('www.example.org')));
  assert.ok(!links.some((link) => link.includes('paytm.com')));
});

test('flags a full scam SMS containing a link', () => {
  const result = analyzeMessage(
    'URGENT: Your SBI account will be blocked. Complete KYC now and share your OTP at http://sbi-kyc-update.xyz/login'
  );

  assert.ok(result.score >= 60, `expected >= 60, got ${result.score}`);
  assert.equal(verdictFromScore(result.score), 'Dangerous');
  assert.equal(result.links.length, 1);
  assert.ok(result.signals.length > 0);
  assert.ok(result.signals.every((signal) => signal.source === 'rules'));
  assert.ok(result.signals.some((signal) => signal.link === 'sbi-kyc-update.xyz'));
});

test('flags a text-only scam with no link', () => {
  const result = analyzeMessage(
    'Congratulations! You have won a lottery of Rs 50,000. Send your OTP to claim your prize money.'
  );

  assert.ok(result.score >= 60, `expected >= 60, got ${result.score}`);
  assert.equal(result.links.length, 0);
});

test('does not flag a normal OTP warning', () => {
  const result = analyzeMessage('Your OTP is 482913. Do not share it with anyone.');

  assert.ok(result.score < 30, `expected < 30, got ${result.score}`);
  assert.equal(result.links.length, 0);
});
