'use strict';

const crypto = require('crypto');
const { db } = require('../db');
const config = require('../config');
const { createReportPdf } = require('./reportPdf.service');

const MAX_CALLBACK_BYTES = 2 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 1024 * 1024;
const MAX_SCREENSHOTS = 4;

function isConfigured() {
  return Boolean(config.sandboxApiBaseUrl && config.sandboxApiKey
    && config.webhookSigningSecret && config.appWebhookBaseUrl
    && Boolean(config.cfAccessClientId) === Boolean(config.cfAccessClientSecret));
}

function sandboxHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.sandboxApiKey,
  };
  if (config.cfAccessClientId) {
    headers['CF-Access-Client-Id'] = config.cfAccessClientId;
  }
  if (config.cfAccessClientSecret) {
    headers['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
  }
  return headers;
}

function updateJobError(id, message) {
  db.prepare(
    `UPDATE analysis_jobs
     SET status = 'error', error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`
  ).run(message.slice(0, 500), id);
}

async function submitJob(id) {
  const job = db.prepare(
    `SELECT j.id, j.client_ref, j.rule_score, u.url
     FROM analysis_jobs j
     JOIN checks c ON c.id = j.check_id
     JOIN urls u ON u.id = c.url_id
     WHERE j.id = ?`
  ).get(id);
  if (!job) throw new Error('Analysis job no longer exists.');

  const baseUrl = new URL(config.sandboxApiBaseUrl);
  if (baseUrl.protocol !== 'https:' && config.nodeEnv === 'production') {
    throw new Error('Sandbox API must use HTTPS in production.');
  }
  const callbackUrl = new URL('/api/webhooks/scan-done', config.appWebhookBaseUrl);
  if (callbackUrl.protocol !== 'https:' && config.nodeEnv === 'production') {
    throw new Error('Webhook base URL must use HTTPS in production.');
  }

  const response = await fetch(new URL('/scan', baseUrl), {
    method: 'POST',
    headers: sandboxHeaders(),
    body: JSON.stringify({
      url: job.url,
      client_ref: job.client_ref,
      callback_url: callbackUrl.href,
      fill_form: false,
      persona_runs: 0,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (response.status !== 202) {
    throw new Error(`Sandbox rejected the scan request (${response.status}).`);
  }
  const payload = await response.json();
  if (!payload || typeof payload.job_id !== 'string' || payload.job_id.length > 128) {
    throw new Error('Sandbox returned an invalid job identifier.');
  }
  db.prepare(
    `UPDATE analysis_jobs
     SET external_job_id = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`
  ).run(payload.job_id, payload.status === 'running' ? 'running' : 'queued', id);
}

function queueAnalysis({ userId, checkId, ruleScore }) {
  if (ruleScore <= 60) return { status: 'not_triggered', reason: 'rule_score_below_threshold' };
  if (!userId) return { status: 'sign_in_required', reason: 'dynamic_analysis_requires_account' };
  if (!isConfigured()) return { status: 'unavailable', reason: 'sandbox_not_configured' };

  const clientRef = crypto.randomUUID();
  const info = db.prepare(
    `INSERT INTO analysis_jobs (user_id, check_id, rule_score, client_ref, status)
     VALUES (?, ?, ?, ?, 'queued')`
  ).run(userId, checkId, ruleScore, clientRef);
  const id = Number(info.lastInsertRowid);

  setImmediate(() => {
    submitJob(id).catch((error) => {
      console.error(`[analysis] job ${id} submission failed: ${error.message}`);
      try {
        updateJobError(id, 'Unable to submit the sandbox scan.');
      } catch (updateError) {
        console.error(`[analysis] job ${id} state update failed: ${updateError.message}`);
      }
    });
  });

  return { status: 'queued', jobId: id };
}

function safeNumber(value, max = 1000000) {
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function sanitizeResult(input, expectedJobId, expectedClientRef) {
  if (!input || input.status !== 'done'
    || input.job_id !== expectedJobId
    || input.client_ref !== expectedClientRef) {
    throw new Error('Sandbox callback does not match an active completed job.');
  }

  const verdict = input.verdict && typeof input.verdict === 'object' ? input.verdict : {};
  const navigation = input.navigation && typeof input.navigation === 'object' ? input.navigation : {};
  const metrics = input.network_metrics && typeof input.network_metrics === 'object' ? input.network_metrics : {};
  const screenshots = Array.isArray(input.screenshots) ? input.screenshots.slice(0, MAX_SCREENSHOTS) : [];
  const redirectChain = Array.isArray(navigation.redirect_chain)
    ? navigation.redirect_chain.filter(isHttpUrl).slice(0, 20).map((item) => item.slice(0, 2048))
    : [];
  const topHosts = Array.isArray(metrics.top_hosts)
    ? metrics.top_hosts.slice(0, 20).filter((item) => item && typeof item.host === 'string')
      .map((item) => ({ host: item.host.slice(0, 253), requests: safeNumber(item.requests) || 0 }))
    : [];
  const requestTypes = {};
  if (metrics.requests_by_type && typeof metrics.requests_by_type === 'object') {
    for (const [type, count] of Object.entries(metrics.requests_by_type).slice(0, 20)) {
      if (/^[a-z-]{1,24}$/i.test(type)) requestTypes[type] = safeNumber(count) || 0;
    }
  }

  const result = {
    status: 'done',
    submitted_url: typeof input.submitted_url === 'string' ? input.submitted_url.slice(0, 2048) : '',
    final_url: typeof input.final_url === 'string' ? input.final_url.slice(0, 2048) : '',
    started_at: typeof input.started_at === 'string' ? input.started_at.slice(0, 40) : '',
    finished_at: typeof input.finished_at === 'string' ? input.finished_at.slice(0, 40) : '',
    duration_seconds: safeNumber(input.duration_seconds, 86400),
    verdict: {
      score: safeNumber(verdict.score, 1000000),
      max_score: safeNumber(verdict.max_score, 1000000),
      label: typeof verdict.label === 'string' ? verdict.label.slice(0, 80) : 'Unrated',
      reasons: Array.isArray(verdict.reasons)
        ? verdict.reasons.filter((item) => typeof item === 'string').slice(0, 30).map((item) => item.slice(0, 200))
        : [],
    },
    navigation: {
      hop_count: safeNumber(navigation.hop_count),
      hosts_contacted: safeNumber(navigation.hosts_contacted),
      redirect_chain: redirectChain,
    },
    screenshots: screenshots.map((item, index) => {
      if (!item || typeof item.url !== 'string' || typeof item.stage !== 'string') {
        throw new Error('Sandbox returned an invalid screenshot reference.');
      }
      return { url: item.url.slice(0, 2048), stage: item.stage.slice(0, 80), order: index };
    }),
    network_metrics: {
      requests_by_type: requestTypes,
      top_hosts: topHosts,
      timeline: Array.isArray(metrics.timeline)
        ? metrics.timeline.slice(0, 40).map((item) => ({
          t: safeNumber(item?.t, 86400),
          cumulative_requests: safeNumber(item?.cumulative_requests),
        })).filter((item) => item.t !== null && item.cumulative_requests !== null)
        : [],
    },
  };

  if (!isHttpUrl(result.submitted_url)
    || (result.final_url && !isHttpUrl(result.final_url))) {
    throw new Error('Sandbox callback has no valid submitted URL.');
  }
  return result;
}

function verifySignature(rawBody, signature) {
  if (!config.webhookSigningSecret || typeof signature !== 'string') return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) return false;
  const expected = crypto.createHmac('sha256', config.webhookSigningSecret).update(rawBody).digest();
  const supplied = Buffer.from(match[1], 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function readLimitedBody(response, limit) {
  if (!response.body) throw new Error('Sandbox screenshot has no response body.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('Sandbox screenshot exceeds the size limit.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function fetchScreenshots(result, externalJobId) {
  const base = new URL(config.sandboxApiBaseUrl);
  if (config.nodeEnv === 'production' && base.protocol !== 'https:') {
    throw new Error('Sandbox API must use HTTPS in production.');
  }
  const images = [];
  for (const screenshot of result.screenshots) {
    const url = new URL(screenshot.url);
    if (url.origin !== base.origin || url.username || url.password || url.search || url.hash
      || !url.pathname.startsWith(`/shots/${encodeURIComponent(externalJobId)}/`)
      || !/\/\d+$/.test(url.pathname)) {
      throw new Error('Sandbox screenshot URL is outside the configured job artifact path.');
    }
    const response = await fetch(url, {
      headers: sandboxHeaders(),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    const contentType = response.headers.get('content-type')?.split(';')[0].trim();
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? 0 : Number(contentLengthHeader);
    if (!response.ok || !['image/png', 'image/jpeg'].includes(contentType)
      || (contentLengthHeader !== null && (!Number.isFinite(contentLength) || contentLength > MAX_SCREENSHOT_BYTES))) {
      throw new Error('Sandbox returned an invalid or oversized screenshot.');
    }
    const image = await readLimitedBody(response, MAX_SCREENSHOT_BYTES);
    const isPng = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255;
    if ((contentType === 'image/png' && !isPng) || (contentType === 'image/jpeg' && !isJpeg)) {
      throw new Error('Sandbox screenshot bytes do not match the declared image type.');
    }
    images.push(image);
  }
  return images;
}

async function acceptCallback(rawBody, signature, headerJobId) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_CALLBACK_BYTES) {
    const error = new Error('Invalid sandbox callback body.');
    error.statusCode = 413;
    throw error;
  }
  if (!verifySignature(rawBody, signature)) {
    const error = new Error('Invalid sandbox callback signature.');
    error.statusCode = 401;
    throw error;
  }

  let input;
  try {
    input = JSON.parse(rawBody.toString('utf8'));
  } catch {
    const error = new Error('Sandbox callback is not valid JSON.');
    error.statusCode = 400;
    throw error;
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.client_ref !== 'string' || typeof input.job_id !== 'string'
    || !headerJobId || headerJobId !== input.job_id) {
    const error = new Error('Sandbox callback identifiers are invalid.');
    error.statusCode = 400;
    throw error;
  }

  const job = db.prepare(
    `SELECT j.id, j.user_id, j.rule_score, j.client_ref, j.external_job_id, j.status,
            c.score AS final_score, c.verdict AS rule_verdict, c.signals, u.url, u.host,
            account.telegram_chat_id, account.whatsapp_jid
     FROM analysis_jobs j
     JOIN checks c ON c.id = j.check_id
     JOIN urls u ON u.id = c.url_id
     JOIN users account ON account.id = j.user_id
     WHERE j.client_ref = ?`
  ).get(input.client_ref);
  if (!job || !job.external_job_id || job.external_job_id !== input.job_id) {
    const error = new Error('Unknown sandbox job.');
    error.statusCode = 404;
    throw error;
  }
  if (job.status === 'done') return { accepted: true, duplicate: true };
  if (input.status === 'error') {
    db.prepare(
      `UPDATE analysis_jobs
       SET status = 'error', error = 'Sandbox analysis failed.',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    ).run(job.id);
    return { accepted: true, duplicate: false };
  }

  let result;
  try {
    result = sanitizeResult(input, job.external_job_id, job.client_ref);
    if (result.submitted_url !== job.url) {
      throw new Error('Sandbox callback URL does not match the submitted URL.');
    }
  } catch (validationError) {
    validationError.statusCode = 422;
    throw validationError;
  }
  const images = await fetchScreenshots(result, job.external_job_id);
  const check = {
    ruleScore: job.rule_score,
    score: job.final_score,
    verdict: job.rule_verdict,
    signals: JSON.parse(job.signals || '[]'),
    host: job.host,
  };
  const pdf = await createReportPdf(result, images, check);
  const deliveryStatus = {
    telegram: job.telegram_chat_id ? 'pending' : 'not_connected',
    whatsapp: job.whatsapp_jid ? 'pending' : 'not_connected',
  };
  db.prepare(
    `UPDATE analysis_jobs
     SET status = 'done', result_json = ?, report_pdf = ?, delivery_status = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`
  ).run(JSON.stringify(result), pdf, JSON.stringify(deliveryStatus), job.id);
  setImmediate(() => {
    const { deliverReport } = require('./reportDelivery.service');
    deliverReport(job.user_id, job.id, pdf).catch((error) => {
      console.error(`[report] Delivery processing for job ${job.id} failed: ${error.message}`);
    });
  });
  return { accepted: true, duplicate: false };
}

function getJobForUser(jobId, userId) {
  return db.prepare(
    `SELECT j.id, j.check_id, j.rule_score, j.status, j.error, j.result_json,
            j.delivery_status, j.created_at, j.updated_at, c.score, c.verdict,
            c.signals, u.host,
            CASE WHEN j.report_pdf IS NULL THEN 0 ELSE 1 END AS has_report
     FROM analysis_jobs j
     JOIN checks c ON c.id = j.check_id
     JOIN urls u ON u.id = c.url_id
     WHERE j.id = ? AND j.user_id = ?`
  ).get(jobId, userId);
}

function getJobsForUser(userId, limit = 50) {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  return db.prepare(
    `SELECT j.id, j.check_id, j.status, j.delivery_status, j.created_at, j.updated_at,
            c.score, c.verdict, u.host,
            CASE WHEN j.report_pdf IS NULL THEN 0 ELSE 1 END AS has_report
     FROM analysis_jobs j
     JOIN checks c ON c.id = j.check_id
     JOIN urls u ON u.id = c.url_id
     WHERE j.user_id = ?
     ORDER BY j.created_at DESC, j.id DESC
     LIMIT ?`
  ).all(userId, safeLimit);
}

function getReportForUser(jobId, userId) {
  return db.prepare(
    'SELECT report_pdf FROM analysis_jobs WHERE id = ? AND user_id = ? AND status = ?'
  ).get(jobId, userId, 'done');
}

module.exports = {
  acceptCallback,
  getJobsForUser,
  getJobForUser,
  getReportForUser,
  isConfigured,
  queueAnalysis,
  sanitizeResult,
  verifySignature,
};
