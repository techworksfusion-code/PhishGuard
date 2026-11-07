'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');
const { db } = require('../db');

const TOKEN_PEPPER = process.env.TOKEN_PEPPER;

function hashOtp(code) {
  return crypto.createHash('sha256').update(code + (process.env.TOKEN_PEPPER || '')).digest('hex');
}

async function hashPassword(password) {
  return argon2.hash(password);
}

async function verifyPassword(password, hash) {
  return argon2.verify(hash, password);
}

async function createUser({ name, email, phone, password }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email || null, phone || null);
  if (existing) {
    const err = new Error('Account already exists.');
    err.statusCode = 409;
    throw err;
  }

  let passwordHash = null;
  if (email && password) {
    passwordHash = await hashPassword(password);
  }

  const info = db.prepare(
    'INSERT INTO users (name, email, phone, password_hash, history_sync) VALUES (?, ?, ?, ?, FALSE)'
  ).run(name, email || null, phone || null, passwordHash);

  return getUserById(info.lastInsertRowid);
}

function getUserById(id) {
  return db.prepare('SELECT id, name, email, phone, history_sync, settings, created_at, last_login_at FROM users WHERE id = ? AND deleted_at IS NULL').get(id);
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, name, email, phone, password_hash, history_sync FROM users WHERE email = ? AND deleted_at IS NULL').get(email);
}

function findUserByPhone(phone) {
  return db.prepare('SELECT id, name, email, phone, password_hash, history_sync FROM users WHERE phone = ? AND deleted_at IS NULL').get(phone);
}

async function verifyLogin({ email, phone, password }) {
  const user = email ? findUserByEmail(email) : findUserByPhone(phone);
  if (!user) {
    const err = new Error('Invalid credentials.');
    err.statusCode = 401;
    throw err;
  }

  if (user.password_hash) {
    const valid = await verifyPassword(password || '', user.password_hash);
    if (!valid) {
      const err = new Error('Invalid credentials.');
      err.statusCode = 401;
      throw err;
    }
  }

  db.prepare('UPDATE users SET last_login_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE id = ?').run(user.id);
  return user;
}

function issueOtp({ destination, purpose }) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO otp_codes (destination, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)'
  ).run(destination, codeHash, purpose, expiresAt);

  return { code, destination };
}

function verifyOtp({ destination, code, purpose }) {
  const row = db.prepare(
    'SELECT * FROM otp_codes WHERE destination = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get(destination, purpose);

  if (!row) {
    const err = new Error('No verification code found. Request a new one.');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date().toISOString();
  if (now > row.expires_at) {
    const err = new Error('Verification code has expired. Request a new one.');
    err.statusCode = 400;
    throw err;
  }

  if (row.attempts >= 5) {
    const err = new Error('Too many failed attempts. Request a new code.');
    err.statusCode = 401;
    throw err;
  }

  const expected = hashOtp(code);
  if (row.code_hash !== expected) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const err = new Error('That code is incorrect.');
    err.statusCode = 401;
    throw err;
  }

  db.prepare('UPDATE otp_codes SET consumed_at = (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) WHERE id = ?').run(row.id);
  return true;
}

module.exports = {
  createUser,
  getUserById,
  findUserByEmail,
  findUserByPhone,
  verifyLogin,
  hashPassword,
  verifyPassword,
  issueOtp,
  verifyOtp,
};
