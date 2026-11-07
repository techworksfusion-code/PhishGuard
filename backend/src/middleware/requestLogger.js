'use strict';

const { db } = require('../db');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const host = req.hostname;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms host=${host}`
    );
  });
  next();
}

module.exports = { requestLogger };
