'use strict';

const path = require('path');
const config = require('../config');
const { consumeLinkCode } = require('./integrations.service');

let socket;
let starting = false;
let restartTimer;
let stopping = false;
const linkAttempts = new Map();

function textFromMessage(message) {
  return message?.conversation
    || message?.extendedTextMessage?.text
    || message?.ephemeralMessage?.message?.conversation
    || message?.ephemeralMessage?.message?.extendedTextMessage?.text
    || '';
}

async function startWhatsApp() {
  if (!config.whatsappEnabled || starting || socket || stopping) return;
  starting = true;
  try {
    const [{ default: makeWASocket, useMultiFileAuthState, DisconnectReason }, qrcode] = await Promise.all([
      import('@whiskeysockets/baileys'),
      import('qrcode-terminal'),
    ]);
    const sessionDir = path.isAbsolute(config.whatsappSessionDir)
      ? config.whatsappSessionDir
      : path.resolve(__dirname, '..', '..', config.whatsappSessionDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const currentSocket = makeWASocket({ auth: state, printQRInTerminal: false });
    socket = currentSocket;
    currentSocket.ev.on('creds.update', saveCreds);
    currentSocket.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        console.log('[whatsapp] Scan this QR with the team sender account:');
        qrcode.default.generate(qr, { small: true });
      }
      if (connection === 'open') console.log('[whatsapp] Team sender account connected.');
      if (connection === 'close') {
        socket = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (!stopping && statusCode !== DisconnectReason.loggedOut) {
          restartTimer = setTimeout(() => {
            startWhatsApp().catch((error) => console.error(`[whatsapp] reconnect failed: ${error.message}`));
          }, 3000);
        } else {
          console.error('[whatsapp] Session logged out; pair the team sender again.');
        }
      }
    });
    currentSocket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages || []) {
        const jid = message.key?.remoteJid;
        if (!jid || jid.endsWith('@g.us') || message.key?.fromMe) continue;
        const text = textFromMessage(message.message).trim();
        const match = /^connect\s+(\d{8})$/i.exec(text);
        if (!match) continue;
        try {
          const now = Date.now();
          const prior = linkAttempts.get(jid);
          const attempts = !prior || now - prior.startedAt >= 10 * 60 * 1000
            ? { startedAt: now, count: 0 }
            : prior;
          if (attempts.count >= 5) continue;
          if (!prior && linkAttempts.size >= 1000) {
            for (const [key, value] of linkAttempts) {
              if (now - value.startedAt >= 10 * 60 * 1000) linkAttempts.delete(key);
            }
          }
          if (!prior && linkAttempts.size >= 1000) continue;
          attempts.count += 1;
          linkAttempts.set(jid, attempts);
          const linked = consumeLinkCode({ channel: 'whatsapp', code: match[1], address: jid });
          const reply = linked
            ? 'Your PhishGuard WhatsApp is connected. Dynamic analysis reports will be sent here.'
            : 'That link code is invalid or expired. Generate a new code in the PhishGuard app.';
          await currentSocket.sendMessage(jid, { text: reply });
        } catch (error) {
          console.error(`[whatsapp] Link processing failed: ${error.message}`);
        }
      }
    });
  } finally {
    starting = false;
  }
}

async function sendDocument(jid, pdf, filename) {
  if (!socket) throw new Error('WhatsApp sender is not connected.');
  await socket.sendMessage(jid, {
    document: pdf,
    mimetype: 'application/pdf',
    fileName: filename,
  });
}

function stopWhatsApp() {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  const active = socket;
  socket = null;
  if (active) active.end(undefined);
}

module.exports = { sendDocument, startWhatsApp, stopWhatsApp };
