'use strict';

// Community threat reporting (BACKEND_DESIGN.md §3 SVG rows marked phase 2
// and §4.5). One vote per account per URL; anonymous users read summaries.

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../db');

const router = Router();

// :urlHash is the urls.url_hash — sha256 of the normalized lower-case URL.
const URL_HASH_RE = /^[a-f0-9]{64}$/i;

function getUrlByUrlHash(urlHash) {
  return db.prepare('SELECT id, url, host FROM urls WHERE url_hash = ?').get(urlHash);
}

function getStats(urlId) {
  return db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN vote = 'dangerous' THEN 1 ELSE 0 END), 0) AS dangerous_votes,
            COALESCE(SUM(CASE WHEN vote = 'safe'      THEN 1 ELSE 0 END), 0) AS safe_votes
       FROM threat_votes WHERE url_id = ?`
  ).get(urlId);
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
  const updated = db.prepare(
    `UPDATE threat_votes SET vote = ? WHERE url_id = ? AND reporter_id = ?`
  ).run(vote, url.id, req.user.id);

  if (updated.changes === 0) {
    try {
      db.prepare(
        'INSERT INTO threat_votes (url_id, reporter_id, vote) VALUES (?, ?, ?)'
      ).run(url.id, req.user.id, vote);
    } catch (err) {
      // Lost a race with an insert from the same account — re-run the update.
      if (String(err.code) !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
      db.prepare(
        `UPDATE threat_votes SET vote = ? WHERE url_id = ? AND reporter_id = ?`
      ).run(vote, url.id, req.user.id);
    }
  }

  const stats = getStats(url.id);
  res.json({
    valid: true,
    host: url.host,
    ...stats,
    my_vote: vote,
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

  let myVote = null;
  if (req.user) {
    const mine = db.prepare(
      'SELECT vote FROM threat_votes WHERE url_id = ? AND reporter_id = ?'
    ).get(url.id, req.user.id);
    myVote = mine ? mine.vote : null;
  }

  res.json({ valid: true, host: url.host, ...getStats(url.id), my_vote: myVote });
}));

module.exports = router;
