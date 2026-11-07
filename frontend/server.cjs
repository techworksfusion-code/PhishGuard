'use strict';

// Minimal static file server for the Vite production build (frontend/dist).
// Listens on 0.0.0.0:8080 and falls back to index.html so React Router
// routes like /auth/google/callback work when addressed directly.
//
// Requests starting with /api are reverse-proxied to the Express backend
// (127.0.0.1:5000), so a single tunnel hostname can serve the site and API.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.WEB_PORT || 8080);
const DIST = path.join(__dirname, 'dist');

// Backend location for /api proxying (must match backend PORT).
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.API_PORT || 5000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.basename(path.dirname(filePath)) === 'assets'
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    });
    res.end(data);
  });
}

function proxyApi(req, res) {
  const proxyReq = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` }
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode || 502, apiRes.headers);
      apiRes.pipe(res);
    }
  );

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy(new Error('API request timed out'));
  });
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `API unavailable: ${err.message}` }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Forward backend traffic to the Express API.
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const resolved = path.join(DIST, safePath);

  // Refuse anything escaping the dist folder.
  if (!resolved.startsWith(DIST)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(res, resolved);
    } else {
      serveFile(res, path.join(DIST, 'index.html'));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PhishGuard web serving ${DIST} on http://localhost:${PORT}`);
});
