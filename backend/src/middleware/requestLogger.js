'use strict';

// Logs method, route path (never the query string or full URL) and host.
// Capture these *before* routing: nested routers rewrite req.url, so reading
// req.path inside the 'finish' callback would only show '/'.
function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const path = req.path;
  const host = req.hostname;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const verdict = res.locals.verdict ? ` verdict=${res.locals.verdict}` : '';
    console.log(
      `[${new Date().toISOString()}] ${method} ${path} ${res.statusCode} ${ms}ms host=${host}${verdict}`
    );
  });

  next();
}

module.exports = { requestLogger };
