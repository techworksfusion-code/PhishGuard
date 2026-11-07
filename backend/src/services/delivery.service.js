'use strict';

// OTP delivery channels. BACKEND_DESIGN.md §1.5:
// - 'console' logs the code into server output (development only)
// - 'smtp'    sends the code by email via nodemailer (Gmail by default)
// - 'telegram' | 'whatsapp' — planned channels, not implemented yet

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;

let cachedTransport = null;

function buildSmtpTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      'SMTP channel is selected but SMTP_USER / SMTP_PASS are not set. ' +
      'Set them in backend/.env — for Gmail, SMTP_PASS must be a 16-character App Password.'
    );
  }

  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || DEFAULT_SMTP_PORT);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || DEFAULT_SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; use SMTP_SECURE=false only for local test servers
    auth: { user, pass }
  });
}

function getTransport() {
  if (!cachedTransport) cachedTransport = buildSmtpTransport();
  return cachedTransport;
}

// Exported for tests/dev: forces the next send to rebuild the transport.
function resetTransport() { cachedTransport = null; }

function otpSubject(purpose) {
  return `PhishGuard — your ${purpose} code`;
}

// Plain text only, no links — reduces spam-filter risk and phishing-look confusion (§1.5).
function otpBody({ purpose, code }) {
  const expiryHint = 'This code expires in 10 minutes.';
  const safetyHint = 'If you did not request a code, ignore this email and never share it — anyone asking for it may be a scammer.';

  return [
    `Hello from PhishGuard.`,
    ``,
    `Your ${purpose} verification code is:`,
    ``,
    `    ${code}`,
    ``,
    expiryHint,
    ``,
    safetyHint,
    ``
  ].join('\n');
}

async function sendSmtpOtp({ destination, code, purpose }) {
  const transport = getTransport();

  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destination,
    subject: otpSubject(purpose === 'register' ? 'registration' : 'login'),
    text: otpBody({ purpose, code })
  });

  return { sent: true, channel: 'smtp', messageId: info && info.messageId };
}

function sendOtp({ destination, code, channel = 'console', purpose = 'register' }) {
  const result = { sent: true, channel };

  if (channel === 'console') {
    console.log(`[OTP] ${purpose.toUpperCase()} code for ${destination}: ${code}`);
    result.code = code; // expose code in dev/console channel for testing
    return result;
  }

  if (channel === 'smtp') {
    return sendSmtpOtp({ destination, code, purpose });
  }

  throw new Error(`OTP channel "${channel}" is not implemented yet. Use "console" or "smtp".`);
}

module.exports = { sendOtp, resetTransport, DEFAULT_SMTP_HOST, DEFAULT_SMTP_PORT };
