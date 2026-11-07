'use strict';

const config = require('./config');
const { db, close } = require('./db');
const { migrate } = require('./db/migrate');
const { createApp } = require('./app');

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] unhandledRejection:', err.message);
  process.exit(1);
});

async function main() {
  migrate();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`PhishGuard backend listening on http://localhost:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Database: ${config.databaseUrl}`);
  });

  const shutdown = () => {
    server.close(() => {
      close();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[FATAL] startup failed:', err.message);
  process.exit(1);
});
