'use strict';

function verdictFromScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('score must be an integer between 0 and 100');
  }
  if (score >= 60) return 'Dangerous';
  if (score >= 30) return 'Suspicious';
  return 'Low risk';
}

module.exports = { verdictFromScore };
