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

function optionalBaseUrl(name, value) {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) base URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials or a path.`);
  }
  return parsed.origin;
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
  const whatsappEnabled = get('WHATSAPP_BOT_ENABLED', 'false');
  if (!['true', 'false'].includes(whatsappEnabled)) {
    throw new Error('WHATSAPP_BOT_ENABLED must be "true" or "false".');
  }
  const cfAccessClientId = get('CF_ACCESS_CLIENT_ID', '');
  const cfAccessClientSecret = get('CF_ACCESS_CLIENT_SECRET', '');
  const sandboxApiKey = get('SANDBOX_API_KEY', '');
  const webhookSigningSecret = get('WEBHOOK_SIGNING_SECRET', '');
  if (Boolean(cfAccessClientId) !== Boolean(cfAccessClientSecret)) {
    throw new Error('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET must be set together.');
  }
  if ((sandboxApiKey && Buffer.byteLength(sandboxApiKey) < 32)
    || (webhookSigningSecret && Buffer.byteLength(webhookSigningSecret) < 32)) {
    throw new Error('SANDBOX_API_KEY and WEBHOOK_SIGNING_SECRET must each be at least 32 bytes when set.');
  }

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
    sandboxApiBaseUrl: optionalBaseUrl('SANDBOX_API_BASE_URL', get('SANDBOX_API_BASE_URL', '')),
    sandboxApiKey,
    cfAccessClientId,
    cfAccessClientSecret,
    appWebhookBaseUrl: optionalBaseUrl('APP_WEBHOOK_BASE_URL', get('APP_WEBHOOK_BASE_URL', '')),
    webhookSigningSecret,
    telegramBotToken: get('TELEGRAM_BOT_TOKEN', ''),
    telegramWebhookSecret: get('TELEGRAM_WEBHOOK_SECRET', ''),
    whatsappPublicNumber: get('WHATSAPP_PUBLIC_NUMBER', ''),
    whatsappEnabled: whatsappEnabled === 'true',
    scanRatePerToken: positiveInt('SCAN_RATE_PER_TOKEN', get('SCAN_RATE_PER_TOKEN', '20')),
    corsOrigins: parseCorsOrigins(get('CORS_ORIGINS', DEFAULT_CORS_ORIGINS)),
    nodeEnv: get('NODE_ENV', 'development'),
  };
}

const config = loadConfig();
module.exports = config;
module.exports.loadConfig = loadConfig;
