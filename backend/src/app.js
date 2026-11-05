import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimit } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import routes from './routes/index.js';

export function createApp({ config, logger = console }) {
  if (!config || !Array.isArray(config.corsOrigins)) {
    throw new TypeError('createApp requires a config with a corsOrigins array.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(logger));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || config.corsOrigins.includes(origin));
    },
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(createRateLimit());
  app.use('/api', routes);
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.use(errorHandler(logger));
  return app;
}
