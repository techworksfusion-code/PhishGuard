'use strict';

// Google OAuth 2.0 helper (authorization-code flow).
// The redirect lands on the FRONTEND (/auth/google/callback), which posts the
// code here verbatim; the server exchanges it for tokens and verifies the id
// token (audience, expiry, email_verified) via Google's tokeninfo endpoint —
// no extra npm dependency required on the small student VPS.
//
// Required env (optional: service reports "not configured" without them):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (default
//   http://localhost:5173/auth/google/callback)

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const SCOPE = 'openid email profile';
const DEFAULT_REDIRECT_URI = 'http://localhost:5173/auth/google/callback';

function getClientId() { return (process.env.GOOGLE_CLIENT_ID || '').trim(); }
function getClientSecret() { return (process.env.GOOGLE_CLIENT_SECRET || '').trim(); }
function getRedirectUri() {
  return (process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
}

function isConfigured() {
  return Boolean(getClientId() && getClientSecret());
}

// Frontend must remember `state` and send it back for a coarse CSRF check.
function buildAuthUrl() {
  const state = require('crypto').randomBytes(24).toString('hex');

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    state,
    prompt: 'select_account'
  });

  return { url: `${AUTHORIZE_URL}?${params.toString()}`, state };
}

function fail(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

async function verifyGoogleCode(code) {
  if (!isConfigured()) {
    fail(503, 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.');
  }
  if (!code) {
    fail(400, 'Google authorization code is required.');
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    fail(401, `Google rejected the sign-in code. ${detail.slice(0, 140)}`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.id_token) {
    fail(401, 'Google did not return an id token.');
  }

  const infoRes = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(tokens.id_token)}`);
  if (!infoRes.ok) {
    fail(401, 'Could not verify the Google token.');
  }
  const info = await infoRes.json();

  if (info.aud !== getClientId()) {
    fail(401, 'Google token was issued for a different app.');
  }
  if (Number(info.exp) * 1000 < Date.now()) {
    fail(401, 'Google token has expired.');
  }
  if (info.email_verified !== true && info.email_verified !== 'true') {
    fail(401, 'Google account email is not verified.');
  }
  if (!info.email) {
    fail(400, 'Google account did not share an email address.');
  }

  return {
    sub: info.sub,
    email: String(info.email).toLowerCase(),
    name: info.name || String(info.email).split('@')[0]
  };
}

module.exports = { isConfigured, buildAuthUrl, verifyGoogleCode };
