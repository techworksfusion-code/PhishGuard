'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { listAlerts } = require('../services/alerts.service');

const router = Router();

// GET /api/alerts?limit=20 — real-time protection events for this account.
// Sender numbers are never stored; sender_hash is an opaque digest.
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const requested = Number(req.query.limit);
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.trunc(requested))) : 20;

  res.json({
    alerts: listAlerts(req.user.id, { limit: limit || 20 }),
  });
}));

module.exports = router;
