import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { openDatabase } from './db/index.js';
import { migrate } from './db/migrate.js';

export function startServer() {
  const config = loadConfig();
  const db = openDatabase(config.databaseUrl);

  try {
    migrate(db);
    const app = createApp({ config });
    const server = app.listen(config.port, () => {
      console.info(`PhishGuard API listening on port ${config.port}.`);
    });

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        server.close(() => {
          db.close();
        });
      });
    }

    return { server, db };
  } catch (error) {
    db.close();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    startServer();
  } catch (error) {
    console.error('Unable to start PhishGuard API.', error);
    process.exitCode = 1;
  }
}
