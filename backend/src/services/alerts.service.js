'use strict';

// alert_events persistence. PRIVACY: the SMS body is never accepted here —
// only the sender hash, link count and verdicts (§8A).

const { db } = require('../db');

function recordAlert({
  userId = null,
  urlId = null,
  senderHash,
  linkCount = 0,
  localVerdict = null,
  score = null,
  verdict = null,
  aiStatus = null,
  notified = false,
  inAppShown = false,
}) {
  const info = db.prepare(
    `INSERT INTO alert_events
       (user_id, url_id, sender_hash, link_count, local_verdict, score, verdict,
        ai_status, notified, in_app_shown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    urlId,
    senderHash,
    linkCount,
    localVerdict,
    score,
    verdict,
    aiStatus,
    notified ? 1 : 0,
    inAppShown ? 1 : 0
  );
  return info.lastInsertRowid;
}

function listAlerts(userId, { limit = 20 } = {}) {
  return db.prepare(
    `SELECT a.id, a.sender_hash, a.link_count, a.local_verdict, a.score,
            a.verdict, a.ai_status, a.notified, a.in_app_shown, a.created_at,
            u.host
       FROM alert_events a
       LEFT JOIN urls u ON u.id = a.url_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`
  ).all(userId, limit);
}

module.exports = { recordAlert, listAlerts };
