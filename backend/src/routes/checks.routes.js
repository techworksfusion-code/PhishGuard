'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { normalizeUrl } = require('../utils/normalizeUrl');
const { verdictFromScore } = require('../utils/verdict');
const { findOrCreateUrl } = require('../services/urls.service');
const { analyze } = require('../analyzer');
const { analyzeWithGemini } = require('../services/gemini.service');
const { persistCheck, getHistory, getAnonymousHistory } = require('../services/checks.service');

const router = Router();

// POST /api/check-link
router.post('/check-link', optionalAuth, asyncHandler(async (req, res) => {
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
    urlHash: parsed.urlHash,
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

// GET /api/history (stub — requires auth)
router.get('/history', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.history_sync) {
    return res.json([]);
  }
  const rows = getHistory({ userId: req.user.id, limit: 20 });
  res.json(rows.map((row) => ({
    id: row.id,
    host: row.host,
    score: row.score,
    verdict: row.verdict,
    ai: row.ai_status,
    signals: JSON.parse(row.signals || '[]'),
    time: row.created_at,
  })));
}));

module.exports = router;
