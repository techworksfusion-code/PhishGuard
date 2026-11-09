'use strict';

const express = require('express');
const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { acceptCallback } = require('../services/analysis.service');
const config = require('../config');
const { consumeLinkCode } = require('../services/integrations.service');
const { sendMessage } = require('../services/telegram.service');

const router = Router();

router.post('/scan-done', express.raw({ type: 'application/json', limit: '2mb' }), asyncHandler(async (req, res) => {
  const result = await acceptCallback(req.body, req.get('X-Signature'), req.get('X-Job-Id'));
  res.json(result);
}));

router.post('/telegram', express.json({ limit: '64kb' }), asyncHandler(async (req, res) => {
  const supplied = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
  const expected = config.telegramWebhookSecret || '';
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  const validSecret = expectedBuffer.length > 0
    && suppliedBuffer.length === expectedBuffer.length
    && require('crypto').timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (!validSecret) return res.status(401).json({ error: 'Invalid Telegram webhook secret.' });

  const message = req.body?.message;
  const chat = message?.chat;
  if (!chat || chat.type !== 'private' || typeof message.text !== 'string') {
    return res.json({ ok: true });
  }
  const match = /^\/start(?:@\w+)?\s+(\d{8})$/i.exec(message.text.trim());
  if (!match) {
    await sendMessage(chat.id, 'To connect your account, generate a one-time link code in the PhishGuard app and send /start followed by that code.');
    return res.json({ ok: true });
  }

  const linked = consumeLinkCode({
    channel: 'telegram',
    code: match[1],
    address: String(chat.id),
  });
  await sendMessage(
    chat.id,
    linked
      ? 'Your PhishGuard Telegram is connected. Dynamic analysis reports will be sent here.'
      : 'That link code is invalid or expired. Generate a new code in the PhishGuard app.'
  );
  res.json({ ok: true });
}));

module.exports = router;
