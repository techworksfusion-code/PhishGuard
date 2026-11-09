'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const { normalizeUrl } = require('../utils/normalizeUrl');
const { verdictFromScore } = require('../utils/verdict');
const { findOrCreateUrl } = require('../services/urls.service');
const { getVoteStats } = require('../services/votes.service');
const { analyze } = require('../analyzer');
const { analyzeWithGemini } = require('../services/gemini.service');
const { persistCheck } = require('../services/checks.service');
const { queueAnalysis } = require('../services/analysis.service');

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

  // The service enforces the GEMINI_DAILY_MAX budget before any network call;
  // when it is exhausted (or the key is absent/invalid) we keep the rule verdict.
  const aiResult = await analyzeWithGemini(parsed.normalized);

  const ruleScore = ruleResult.score;
  const aiScore = aiResult.status === 'ok' ? aiResult.score : 0;
  const finalScore = Math.min(100, Math.max(ruleScore, aiScore));
  const verdict = verdictFromScore(finalScore);

  const allSignals = ruleResult.signals.map((signal) => ({ ...signal, source: 'rules' }));
  if (aiResult.status === 'ok') {
    if (aiResult.signals.length) {
      allSignals.push(...aiResult.signals.map((signal) => ({ ...signal, source: 'ai' })));
    }
  } else {
    allSignals.push({
      name: 'AI check',
      points: 0,
      source: 'system',
      detail: aiResult.reason === 'daily_cap'
        ? 'AI budget reached for today — rules-only result'
        : 'AI analysis unavailable — rules-only result',
    });
  }

  const checkId = persistCheck({
    userId: req.user ? req.user.id : null,
    urlId,
    score: finalScore,
    verdict,
    aiStatus: aiResult.status,
    signals: allSignals,
  });
  const dynamicAnalysis = queueAnalysis({
    userId: req.user ? req.user.id : null,
    checkId,
    ruleScore,
  });

  const votes = getVoteStats(urlId, { userId: req.user ? req.user.id : null });

  res.locals.verdict = verdict;
  res.json({
    valid: true,
    host: parsed.host,
    score: finalScore,
    verdict,
    ai: aiResult.status === 'ok' ? 'ok' : 'unavailable',
    signals: allSignals,
    checkId,
    dynamicAnalysis,
    urlHash: parsed.hash,
    votes,
  });
}));

module.exports = router;
