'use strict';

// Community vote helpers shared by /api/check-link and /api/links/*.
// Counts follow BACKEND_DESIGN.md §5.6 (threat_votes) via one query per URL.

const { db } = require('../db');

function getVoteStats(urlId, { userId = null } = {}) {
  const stats = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN vote = 'dangerous' THEN 1 ELSE 0 END), 0) AS dangerous_votes,
            COALESCE(SUM(CASE WHEN vote = 'safe'      THEN 1 ELSE 0 END), 0) AS safe_votes
       FROM threat_votes WHERE url_id = ?`
  ).get(urlId);

  let my = null;
  if (userId) {
    const mine = db.prepare(
      'SELECT vote FROM threat_votes WHERE url_id = ? AND reporter_id = ?'
    ).get(urlId, userId);
    my = mine ? mine.vote : null;
  }

  return { dangerous: stats.dangerous_votes, safe: stats.safe_votes, my };
}

function castVote({ urlId, userId, vote }) {
  const updated = db.prepare(
    'UPDATE threat_votes SET vote = ? WHERE url_id = ? AND reporter_id = ?'
  ).run(vote, urlId, userId);

  if (updated.changes === 0) {
    try {
      db.prepare(
        'INSERT INTO threat_votes (url_id, reporter_id, vote) VALUES (?, ?, ?)'
      ).run(urlId, userId, vote);
    } catch (err) {
      // Lost a race against another insert from the same account — re-update.
      if (String(err.code) !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
      db.prepare(
        'UPDATE threat_votes SET vote = ? WHERE url_id = ? AND reporter_id = ?'
      ).run(vote, urlId, userId);
    }
  }
}

module.exports = { getVoteStats, castVote };
