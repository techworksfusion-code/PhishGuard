'use strict';

function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.path}:`, err.message);

  const status = err.statusCode || err.status || 500;
  // 500 is a unexpected bug: never leak internals. 502/503 are operational
  // availability errors (e.g. OAuth not configured) — safe user-facing messages.
  const message = status === 500 ? 'Unexpected server error.' : err.message || 'An error occurred.';

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
