'use strict';

const { db } = require('../db');
const { verdictFromScore } = require('../utils/verdict');

function persistCheck({ userId, urlId, score, verdict, aiStatus, signals }) {
  const info = db.prepare(
    `INSERT INTO checks (user_id, url_id, score, verdict, ai_status, signals)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId || null, urlId, score, verdict, aiStatus, JSON.stringify(signals));
  return info.lastInsertRowid;
}

function getHistory({ userId, limit = 20 }) {
  return db.prepare(
    `SELECT c.id, c.score, c.verdict, c.ai_status, c.signals, c.created_at,
            u.url, u.host
     FROM checks c
     JOIN urls u ON u.id = c.url_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC
     LIMIT ?`
  ).all(userId, limit);
}

function getAnonymousHistory({ limit = 20 }) {
  return db.prepare(
    `SELECT c.id, c.score, c.verdict, c.ai_status, c.signals, c.created_at,
            u.url, u.host
     FROM checks c
     JOIN urls u ON u.id = c.url_id
     WHERE c.user_id IS NULL
     ORDER BY c.created_at DESC
     LIMIT ?`
  ).all(limit);
}

module.exports = { persistCheck, getHistory, getAnonymousHistory };
