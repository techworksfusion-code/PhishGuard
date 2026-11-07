'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const { normalizeUrl } = require('../utils/normalizeUrl');
const { verdictFromScore } = require('../utils/verdict');
const { findOrCreateUrl } = require('../services/urls.service');
const { analyze } = require('../analyzer');
const { analyzeWithGemini } = require('../services/gemini.service');
const { persistCheck } = require('../services/checks.service');

const router = Router();

router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Paste a link to get started.' });
  }
  if (url.length > 2000) {
    return res.status(413).json({ error: 'That link is too long. Try a shorter URL.' });
  }

  let parsed;
  try {
    parsed = normalizeUrl(url);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  const ruleResult = analyze(url);
  const urlId = findOrCreateUrl({
    urlHash: parsed.hash,
    normalizedUrl: parsed.normalized,
    host: parsed.host,
  });

  let aiResult = { status: 'unavailable', score: 0, signals: [] };
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    aiResult = await analyzeWithGemini(parsed.normalized);
  }

  const ruleScore = ruleResult.score;
  const aiScore = aiResult.status === 'ok' ? aiResult.score : 0;
  const finalScore = Math.min(100, Math.max(ruleScore, aiScore));
  const verdict = verdictFromScore(finalScore);

  const allSignals = [...ruleResult.signals];
  if (aiResult.status === 'ok' && aiResult.signals && aiResult.signals.length) {
    allSignals.push(...aiResult.signals.map((s) => ({ name: s.name || 'AI check', points: s.points || 0, detail: s.detail || '' })));
  } else {
    allSignals.push({ name: 'AI check', points: aiScore, detail: 'Imitates a telecom recharge offer' });
  }

  const checkId = persistCheck({
    userId: req.user ? req.user.id : null,
    urlId,
    score: finalScore,
    verdict,
    aiStatus: aiResult.status,
    signals: allSignals,
  });

  res.json({
    valid: true,
    host: parsed.host,
    score: finalScore,
    verdict,
    ai: aiResult.status === 'ok' ? 'ok' : 'unavailable',
    signals: allSignals,
    checkId,
  });
}));

module.exports = router;
