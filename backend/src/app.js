'use strict';

const helmet = require('helmet');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { authRateLimiter } = require('./middleware/rateLimit');
const { validate } = require('./middleware/validate');
const { optionalAuth } = require('./middleware/auth');
const routes = require('./routes');

function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: process.env.VITE_API_URL || '*' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests. Try again later.' } }));
  app.use('/api/auth', authRateLimiter);

  app.use(validate);
  app.use(optionalAuth);

app.use('/api', routes);

app.use((_req, _res, next) => {
  const err = new Error('Not found');
  err.statusCode = 404;
  next(err);
});

app.use(errorHandler);

  return app;
}

module.exports = { createApp };
