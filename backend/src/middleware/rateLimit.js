'use strict';

const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many auth requests. Try again later.' },
});

module.exports = { authRateLimiter };
