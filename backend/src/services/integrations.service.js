'use strict';

const crypto = require('crypto');
const { db } = require('../db');
const config = require('../config');

const CHANNELS = new Set(['telegram', 'whatsapp']);

function hashCode(code) {
  return crypto.createHash('sha256').update(`${code}:${config.tokenPepper}`).digest('hex');
}

function createLinkCode({ userId, channel }) {
  if (!CHANNELS.has(channel)) throw new Error('Unsupported messaging channel.');
  if (channel === 'telegram' && !config.telegramBotToken) {
    const error = new Error('Telegram bot integration is not configured.');
    error.statusCode = 503;
    throw error;
  }
  if (channel === 'whatsapp' && (!config.whatsappEnabled || !config.whatsappPublicNumber)) {
    const error = new Error('WhatsApp bot integration is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const code = crypto.randomInt(10000000, 100000000).toString();
  const codeHash = hashCode(code);
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE integration_link_codes
       SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ? AND channel = ? AND consumed_at IS NULL`
    ).run(userId, channel);
    db.prepare(
      `INSERT INTO integration_link_codes (user_id, channel, code_hash, expires_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now', '+10 minutes'))`
    ).run(userId, channel, codeHash);
  });
  transaction();
  return code;
}

function consumeLinkCode({ channel, code, address }) {
  if (!CHANNELS.has(channel) || typeof code !== 'string' || !/^\d{8}$/.test(code)
    || typeof address !== 'string' || !address || address.length > 200) {
    return false;
  }
  const row = db.prepare(
    `SELECT c.id, c.user_id FROM integration_link_codes c
     JOIN users u ON u.id = c.user_id
     WHERE channel = ? AND code_hash = ? AND consumed_at IS NULL
       AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       AND u.deleted_at IS NULL
     ORDER BY c.id DESC LIMIT 1`
  ).get(channel, hashCode(code));
  if (!row) return false;

  const transaction = db.transaction(() => {
    const used = db.prepare(
      `UPDATE integration_link_codes
       SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND consumed_at IS NULL`
    ).run(row.id);
    if (used.changes !== 1) return false;
    const column = channel === 'telegram' ? 'telegram_chat_id' : 'whatsapp_jid';
    db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(address, row.user_id);
    return true;
  });
  return transaction();
}

function getIntegrationStatus(userId) {
  const row = db.prepare(
    'SELECT telegram_chat_id, whatsapp_jid FROM users WHERE id = ?'
  ).get(userId);
  return {
    telegram: {
      connected: Boolean(row && row.telegram_chat_id),
      available: Boolean(config.telegramBotToken),
    },
    whatsapp: {
      connected: Boolean(row && row.whatsapp_jid),
      available: Boolean(config.whatsappEnabled && config.whatsappPublicNumber),
      publicNumber: config.whatsappPublicNumber || null,
    },
  };
}

function unlinkIntegration({ userId, channel }) {
  if (!CHANNELS.has(channel)) return false;
  const column = channel === 'telegram' ? 'telegram_chat_id' : 'whatsapp_jid';
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE integration_link_codes
       SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ? AND channel = ? AND consumed_at IS NULL`
    ).run(userId, channel);
    return db.prepare(`UPDATE users SET ${column} = NULL WHERE id = ?`).run(userId).changes > 0;
  });
  return transaction();
}

module.exports = { consumeLinkCode, createLinkCode, getIntegrationStatus, unlinkIntegration };
