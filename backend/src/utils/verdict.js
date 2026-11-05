export function verdictForScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Score must be an integer between 0 and 100.');
  }
  if (score >= 60) return 'Dangerous';
  if (score >= 30) return 'Suspicious';
  return 'Low risk';
}
