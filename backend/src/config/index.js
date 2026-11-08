'use strict';

require('dotenv').config();

const required = ['DATABASE_URL', 'TOKEN_PEPPER', 'ALERT_PEPPER', 'GEMINI_API_KEY'];
const DEFAULT_CORS_ORIGINS = 'https://guard.fusiontechworks.in,http://localhost:5173';

function parseCorsOrigins(raw) {
  const origins = String(raw)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS entries must be HTTP(S) origins (got "${origin}").`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`CORS_ORIGINS entries must be HTTP(S) origins (got "${origin}").`);
    }
  }

  return origins;
}

function positiveInt(name, value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Missing or invalid ${name}: expected an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function loadConfig(env = process.env) {
  const get = (name, fallback) => {
    const value = env[name];
    if (value !== undefined && value !== '') return value;
    return fallback;
  };
  const requireEnv = (name) => {
    const value = env[name];
    if (!value) {
      throw new Error(
        `Missing required environment variable: ${name}. ` +
        `Copy backend/.env.example to backend/.env and fill in the values.`
      );
    }
    return value;
  };

  required.forEach(requireEnv);

  return {
    port: positiveInt('PORT', get('PORT', '5000'), { max: 65535 }),
    databaseUrl: requireEnv('DATABASE_URL'),
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    geminiModel: get('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    geminiDailyMax: positiveInt('GEMINI_DAILY_MAX', get('GEMINI_DAILY_MAX', '100'), { min: 0 }),
    alertPepper: requireEnv('ALERT_PEPPER'),
    tokenPepper: requireEnv('TOKEN_PEPPER'),
    otpChannel: get('OTP_CHANNEL', 'console'),
    whatsappSessionDir: get('WHATSAPP_SESSION_DIR', './sessions'),
    scanRatePerToken: positiveInt('SCAN_RATE_PER_TOKEN', get('SCAN_RATE_PER_TOKEN', '20')),
    corsOrigins: parseCorsOrigins(get('CORS_ORIGINS', DEFAULT_CORS_ORIGINS)),
    nodeEnv: get('NODE_ENV', 'development'),
  };
}

const config = loadConfig();
module.exports = config;
module.exports.loadConfig = loadConfig;
