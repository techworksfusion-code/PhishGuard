'use strict';

const crypto = require('crypto');
const { db } = require('../db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token + (process.env.TOKEN_PEPPER || '')).digest('hex');
}

function createSession({ userId, userAgent }) {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const info = db.prepare(
    'INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?)'
  ).run(userId, tokenHash, userAgent || null, expiresAt);

  return { token, sessionId: info.lastInsertRowid };
}

function getSessionByToken(token) {
  const tokenHash = hashToken(token);
  const row = db.prepare(
    `SELECT s.id, s.user_id, s.token_hash, s.created_at, s.expires_at, s.revoked_at,
            u.id AS user_id, u.name, u.email, u.phone, u.history_sync
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL
       AND s.expires_at > (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       AND u.deleted_at IS NULL`
  ).get(tokenHash);
  return row;
}

function revokeSession(token) {
  const tokenHash = hashToken(token);
  db.prepare('UPDATE sessions SET revoked_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE token_hash = ? AND revoked_at IS NULL').run(tokenHash);
}

function revokeAllSessionsForUser(userId) {
  db.prepare('UPDATE sessions SET revoked_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE user_id = ? AND revoked_at IS NULL').run(userId);
}

module.exports = { createSession, getSessionByToken, revokeSession, revokeAllSessionsForUser, hashToken };
