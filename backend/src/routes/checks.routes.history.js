'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { getHistory, getAnonymousHistory } = require('../services/checks.service');

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
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
