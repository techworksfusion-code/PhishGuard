import dotenv from 'dotenv';

dotenv.config();

export function loadConfig(env = process.env) {
  const geminiApiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey || geminiApiKey === 'replace-with-your-key') {
    throw new Error('GEMINI_API_KEY is required. Set it in backend/.env before starting the API.');
  }

  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const databaseUrl = env.DATABASE_URL?.trim() || 'sqlite://./data/phishguard.db';
  if (!databaseUrl.startsWith('sqlite://') || databaseUrl.length <= 'sqlite://'.length) {
    throw new Error('DATABASE_URL must be a non-empty sqlite:// URL.');
  }

  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5173,https://localhost')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error(`CORS_ORIGINS entries must be HTTP(S) origins without paths: ${origin}`);
      }
      return parsed.origin;
    });

  return { geminiApiKey, databaseUrl, port, corsOrigins };
}
