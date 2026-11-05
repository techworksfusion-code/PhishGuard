import rateLimit from 'express-rate-limit';

export function createRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
  });
}
