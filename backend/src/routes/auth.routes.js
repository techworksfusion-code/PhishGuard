'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const {
  createUser,
  findUserByEmail,
  findUserByPhone,
  verifyLogin,
  issueOtp,
  verifyOtp,
} = require('../services/auth.service');
const { createSession, revokeSession } = require('../services/token.service');
const { sendOtp } = require('../services/delivery.service');
const { db } = require('../db');

const router = Router();

// POST /api/auth/register — validate + create user + issue OTP (no session yet)
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required.' });
  }
  if (email && !password) {
    return res.status(400).json({ error: 'Password is required for email accounts.' });
  }

  await createUser({ name: name.trim(), email: email || null, phone: phone || null, password: password || null });

  const destination = email || phone;
  const channel = process.env.OTP_CHANNEL || 'console';
  const { code } = issueOtp({ destination, purpose: 'register' });
  await sendOtp({ destination, code, channel, purpose: 'register' });

  res.json({ requiresOtp: true, destination, channel });
}));

// POST /api/auth/otp/request — request a new OTP code
router.post('/otp/request', asyncHandler(async (req, res) => {
  const { destination, purpose = 'register' } = req.body || {};

  if (!destination) {
    return res.status(400).json({ error: 'Destination (email or phone) is required.' });
  }

  const channel = process.env.OTP_CHANNEL || 'console';
  const { code } = issueOtp({ destination, purpose });
  await sendOtp({ destination, code, channel, purpose });

  res.json({ sent: true, channel, destination });
}));

// POST /api/auth/otp/verify — verify OTP code, create session
router.post('/otp/verify', asyncHandler(async (req, res) => {
  const { destination, code, purpose = 'register', name, email, phone, password } = req.body || {};

  if (!destination || !code) {
    return res.status(400).json({ error: 'Destination and code are required.' });
  }

  await verifyOtp({ destination, code, purpose });

  let user;
  if (purpose === 'register') {
    user = findUserByEmail(destination) || findUserByPhone(destination);
    if (!user) {
      return res.status(400).json({ error: 'Account not found. Please register first.' });
    }
  } else {
    user = findUserByEmail(destination) || findUserByPhone(destination);
    if (!user) {
      return res.status(401).json({ error: 'Account not found.' });
    }
  }

  const { token } = createSession({ userId: user.id, userAgent: req.get('User-Agent') });

  res.json({
    token,
    account: { id: user.id, name: user.name, email: user.email, phone: user.phone },
  });
}));

// POST /api/auth/login — verify credentials + issue OTP (no session yet unless OTP_LOGIN=false)
router.post('/login', asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body || {};

  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required.' });
  }

  await verifyLogin({ email: email || null, phone: phone || null, password: password || null });

  if (process.env.OTP_LOGIN !== 'true') {
    const user = findUserByEmail(email) || findUserByPhone(phone);
    const { token } = createSession({ userId: user.id, userAgent: req.get('User-Agent') });
    return res.json({ token, account: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  }

  const destination = email || phone;
  const channel = process.env.OTP_CHANNEL || 'console';
  const { code } = issueOtp({ destination, purpose: 'login' });
  await sendOtp({ destination, code, channel, purpose: 'login' });

  res.json({ requiresOtp: true, destination, channel });
}));

// GET /api/auth/session — requires auth
router.get('/session', requireAuth, asyncHandler(async (req, res) => {
  res.json({ account: req.user });
}));

// DELETE /api/auth/session — requires auth
router.delete('/session', requireAuth, asyncHandler(async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    revokeSession(token);
  }
  res.json({ ok: true });
}));

// DELETE /api/auth/account — requires auth
router.delete('/account', requireAuth, asyncHandler(async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    revokeSession(token);
  }
  db.prepare('UPDATE users SET deleted_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
}));

module.exports = router;
