'use strict';

// Daily call budget for the Gemini API (M6 cost guard).
// The reservation is taken atomically with BEGIN IMMEDIATE so that two
// cluster workers (or a restart race) cannot both spend the last call.

const { db } = require('../db');

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const reserveTx = db.transaction((day, max) => {
  const row = db.prepare('SELECT calls FROM gemini_usage WHERE day = ?').get(day);
  const calls = row ? row.calls : 0;

  if (calls >= max) {
    return { allowed: false, calls, max };
  }

  const next = calls + 1;
  db.prepare(
    `INSERT INTO gemini_usage (day, calls) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET
       calls = excluded.calls,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).run(day, next);

  return { allowed: true, calls: next, max };
});

function reserveGeminiCall({ day = todayUtc(), max } = {}) {
  const limit = Number(max);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError('max must be a non-negative integer');
  }
  return reserveTx.immediate(day, limit);
}

function getGeminiUsage(day = todayUtc()) {
  const row = db.prepare('SELECT day, calls FROM gemini_usage WHERE day = ?').get(day);
  return { day, calls: row ? row.calls : 0 };
}

module.exports = { reserveGeminiCall, getGeminiUsage, todayUtc };
