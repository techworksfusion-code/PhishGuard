'use strict';

// Community threat reporting (BACKEND_DESIGN.md §3 SVG rows marked phase 2
// and §4.5). One vote per account per URL; anonymous users read summaries.

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../db');
const { getVoteStats, castVote } = require('../services/votes.service');

const router = Router();

// :urlHash is the urls.url_hash — sha256 of the normalized lower-case URL.
const URL_HASH_RE = /^[a-f0-9]{64}$/i;

function getUrlByUrlHash(urlHash) {
  return db.prepare('SELECT id, url, host FROM urls WHERE url_hash = ?').get(urlHash);
}

// POST /api/links/:urlHash/vote 🔒 — body: { vote: 'dangerous' | 'safe' }
router.post('/:urlHash/vote', requireAuth, asyncHandler(async (req, res) => {
  const { urlHash } = req.params;

  if (!URL_HASH_RE.test(urlHash)) {
    return res.status(400).json({ error: 'Invalid link identifier.' });
  }

  const { vote } = req.body || {};
  if (!['dangerous', 'safe'].includes(vote)) {
    return res.status(400).json({ error: 'Vote must be "dangerous" or "safe".' });
  }

  const url = getUrlByUrlHash(urlHash);
  if (!url) {
    return res.status(404).json({ error: 'Unknown link. Check it first, then vote.' });
  }

  // One vote per account per URL: update the existing row if present.
  castVote({ urlId: url.id, userId: req.user.id, vote });

  const stats = getVoteStats(url.id, { userId: req.user.id });
  res.json({
    valid: true,
    host: url.host,
    dangerous: stats.dangerous,
    safe: stats.safe,
    my: stats.my,
  });
}));

// GET /api/links/:urlHash/summary — aggregated community stats (public).
router.get('/:urlHash/summary', asyncHandler(async (req, res) => {
  const { urlHash } = req.params;

  if (!URL_HASH_RE.test(urlHash)) {
    return res.status(400).json({ error: 'Invalid link identifier.' });
  }

  const url = getUrlByUrlHash(urlHash);
  if (!url) {
    return res.status(404).json({ error: 'Unknown link.' });
  }

  const stats = getVoteStats(url.id, { userId: req.user ? req.user.id : null });
  res.json({
    valid: true,
    host: url.host,
    dangerous: stats.dangerous,
    safe: stats.safe,
    my: stats.my,
  });
}));

module.exports = router;
