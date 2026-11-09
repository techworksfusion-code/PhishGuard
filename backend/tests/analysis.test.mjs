import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'test-key';
process.env.WEBHOOK_SIGNING_SECRET = 'test-webhook-secret-with-sufficient-length';

const { queueAnalysis, sanitizeResult, verifySignature } = await import('../src/services/analysis.service.js');
const { createReportPdf } = await import('../src/services/reportPdf.service.js');

test('sandbox result stores only passive-analysis fields', () => {
  const result = sanitizeResult({
    job_id: 'job-1',
    client_ref: 'client-1',
    status: 'done',
    submitted_url: 'https://example.test/',
    final_url: 'https://redirect.test/',
    verdict: { score: 3, max_score: 5, label: 'medium', reasons: ['redirects'] },
    navigation: { hop_count: 2, hosts_contacted: 3, redirect_chain: ['https://example.test/'] },
    screenshots: [{ stage: 'loaded', url: 'https://sandbox.test/shots/job-1/0', order: 0 }],
    network_metrics: {
      requests_by_type: { document: 1 },
      top_hosts: [{ host: 'example.test', requests: 2 }],
      timeline: [{ t: 1.2, cumulative_requests: 3 }],
    },
    form_submission: { password: 'should-not-be-stored' },
    hooks_sample: [{ data: 'should-not-be-stored' }],
  }, 'job-1', 'client-1');

  assert.equal(result.status, 'done');
  assert.equal(result.screenshots.length, 1);
  assert.deepEqual(result.network_metrics.timeline, [{ t: 1.2, cumulative_requests: 3 }]);
  assert.equal(JSON.stringify(result).includes('should-not-be-stored'), false);
  assert.equal('form_submission' in result, false);
  assert.equal('hooks_sample' in result, false);
});

test('sandbox result requires HTTP(S) URLs and ignores malformed redirect entries', () => {
  const result = sanitizeResult({
    job_id: 'job-2',
    client_ref: 'client-2',
    status: 'done',
    submitted_url: 'https://example.test/',
    final_url: '',
    navigation: { redirect_chain: ['https://example.test/', 'javascript:alert(1)'] },
  }, 'job-2', 'client-2');

  assert.equal(result.final_url, '');
  assert.deepEqual(result.navigation.redirect_chain, ['https://example.test/']);
});

test('sandbox callbacks require a matching HMAC-SHA256 signature', () => {
  const body = Buffer.from('{"status":"done"}');
  const digest = crypto.createHmac('sha256', process.env.WEBHOOK_SIGNING_SECRET)
    .update(body)
    .digest('hex');

  assert.equal(verifySignature(body, `sha256=${digest}`), true);
  assert.equal(verifySignature(body, `sha256=${'0'.repeat(64)}`), false);
  assert.equal(verifySignature(body, digest), false);
});

test('dynamic analysis uses a strict rule-score threshold and requires an account', () => {
  assert.deepEqual(queueAnalysis({ userId: 1, checkId: 1, ruleScore: 60 }), {
    status: 'not_triggered',
    reason: 'rule_score_below_threshold',
  });

  test('report generator produces a PDF with the summary and network graph', async () => {
    const pdf = await createReportPdf({
      submitted_url: 'https://example.test/',
      final_url: 'https://redirect.test/',
      verdict: { label: 'high', score: 4, max_score: 5, reasons: ['redirects'] },
      navigation: { hop_count: 2, hosts_contacted: 3, redirect_chain: ['https://example.test/'] },
      network_metrics: {
        requests_by_type: { document: 1 },
        top_hosts: [{ host: 'example.test', requests: 2 }],
        timeline: [{ t: 1, cumulative_requests: 1 }],
      },
      screenshots: [],
    }, [], {
      host: 'example.test',
      ruleScore: 72,
      score: 76,
      verdict: 'Dangerous',
      signals: [{ name: 'Brand mismatch', points: 40, detail: 'Lookalike host.' }],
    });

    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const contents = pdf.toString('latin1');
    assert.ok(contents.includes('PhishGuard Dynamic Analysis'));
    assert.ok(contents.includes('Rule-based score'));
    assert.ok(contents.includes('Network request timeline'));
  });
  assert.deepEqual(queueAnalysis({ userId: null, checkId: 1, ruleScore: 61 }), {
    status: 'sign_in_required',
    reason: 'dynamic_analysis_requires_account',
  });
});
