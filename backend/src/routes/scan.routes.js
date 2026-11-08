'use strict';

const crypto = require('crypto');
const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const { analyzeMessage } = require('../analyzer');
const { analyzeMessageWithGemini } = require('../services/gemini.service');
const { verdictFromScore } = require('../utils/verdict');
const { normalizeUrl } = require('../utils/normalizeUrl');
const { findOrCreateUrl } = require('../services/urls.service');
const { recordAlert } = require('../services/alerts.service');

const router = Router();

// Manual scans (e.g. the web app) have no sender; device scans always send a
// per-install hash. This constant keeps the NOT NULL column happy without
// ever seeing a phone number.
const ANONYMOUS_SENDER_HASH = crypto
  .createHash('sha256')
  .update('phishguard-anonymous-sender')
  .digest('hex');

// POST /api/scan-message
// { text: string, senderHash?: string }  → { score, verdict, ai, signals, ... }
// PRIVACY: the body is analysed in memory and never written to disk.
router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { text, senderHash } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }
  if (text.length > 4000) {
    return res.status(413).json({ error: 'Message is too long.' });
  }

  let sender = ANONYMOUS_SENDER_HASH;
  if (senderHash !== undefined && senderHash !== null && senderHash !== '') {
    if (typeof senderHash !== 'string' || !/^[a-f0-9]{64}$/i.test(senderHash)) {
      return res.status(422).json({ error: 'senderHash must be a 64-character hex digest.' });
    }
    sender = senderHash.toLowerCase();
  }

  const ruleResult = analyzeMessage(text);
  const aiResult = await analyzeMessageWithGemini(text);

  const aiScore = aiResult.status === 'ok' ? aiResult.score : 0;
  const finalScore = Math.min(100, Math.max(ruleResult.score, aiScore));
  const verdict = verdictFromScore(finalScore);

  const signals = [...ruleResult.signals];
  if (aiResult.status === 'ok') {
    if (aiResult.signals.length) {
      signals.push(...aiResult.signals);
    }
  } else {
    signals.push({
      name: 'AI check',
      points: 0,
      detail: aiResult.reason === 'daily_cap'
        ? 'AI budget reached for today — rules-only result'
        : 'AI analysis unavailable — rules-only result',
    });
  }

  // Only aggregated URL rows are kept; the message text is not.
  let urlId = null;
  if (ruleResult.links.length > 0) {
    try {
      const parsed = normalizeUrl(ruleResult.links[0]);
      urlId = findOrCreateUrl({
        urlHash: parsed.hash,
        normalizedUrl: parsed.normalized,
        host: parsed.host,
      });
    } catch {
      // Extracted link failed normalization — keep the alert without a URL.
    }
  }

  const alertId = recordAlert({
    userId: req.user ? req.user.id : null,
    urlId,
    senderHash: sender,
    linkCount: ruleResult.links.length,
    localVerdict: verdictFromScore(ruleResult.score),
    score: finalScore,
    verdict,
    aiStatus: aiResult.status === 'ok' ? 'ok' : 'unavailable',
  });

  res.locals.verdict = verdict;
  res.json({
    valid: true,
    score: finalScore,
    verdict,
    ai: aiResult.status === 'ok' ? 'ok' : 'unavailable',
    signals,
    linkCount: ruleResult.links.length,
    alertId,
  });
}));

module.exports = router;
