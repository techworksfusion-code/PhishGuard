'use strict';

require('dotenv').config();

const required = ['DATABASE_URL', 'TOKEN_PEPPER', 'ALERT_PEPPER'];

function get(name, fallback) {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  return fallback;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Copy backend/.env.example to backend/.env and fill in the values.`
    );
  }
  return value;
}

required.forEach(requireEnv);

const config = {
  port: Number(get('PORT', '5000')),
  databaseUrl: requireEnv('DATABASE_URL'),
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  geminiModel: get('GEMINI_MODEL', 'gemini-1.5-flash-latest'),
  alertPepper: requireEnv('ALERT_PEPPER'),
  tokenPepper: requireEnv('TOKEN_PEPPER'),
  otpChannel: get('OTP_CHANNEL', 'console'),
  whatsappSessionDir: get('WHATSAPP_SESSION_DIR', './sessions'),
  scanRatePerToken: Number(get('SCAN_RATE_PER_TOKEN', '20')),
  geminiDailyMax: Number(get('GEMINI_DAILY_MAX', '100')),
  nodeEnv: get('NODE_ENV', 'development'),
};

module.exports = config;
