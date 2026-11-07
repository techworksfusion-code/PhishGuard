'use strict';

const crypto = require('crypto');
const { db } = require('../db');
const { hashToken } = require('../services/token.service');

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = auth.slice(7);
  const row = db.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.history_sync
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL
       AND s.expires_at > (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       AND u.deleted_at IS NULL`
  ).get(hashToken(token));
  req.user = row || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Missing or invalid credentials.' });
  }
  next();
}

module.exports = { optionalAuth, requireAuth, hashToken };
