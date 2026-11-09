'use strict';

const Router = require('express').Router;
const { asyncHandler } = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const {
  createLinkCode,
  getIntegrationStatus,
  unlinkIntegration,
} = require('../services/integrations.service');
const { getBotUsername } = require('../services/telegram.service');

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const status = getIntegrationStatus(req.user.id);
  res.json(status);
}));

router.post('/:channel/link-code', requireAuth, asyncHandler(async (req, res) => {
  const { channel } = req.params;
  if (!['telegram', 'whatsapp'].includes(channel)) {
    return res.status(400).json({ error: 'Unsupported messaging channel.' });
  }
  if (channel === 'telegram') {
    if (!config.telegramBotToken) {
      return res.status(503).json({ error: 'Telegram bot integration is not configured.' });
    }
    const username = await getBotUsername();
    if (!username) {
      return res.status(503).json({ error: 'Telegram bot username is not available.' });
    }
    const code = createLinkCode({ userId: req.user.id, channel });
    return res.json({
      channel,
      code,
      expiresInSeconds: 600,
      instructions: `Open @${username}, then send /start ${code}.`,
      botUsername: username,
    });
  }
  if (channel === 'whatsapp') {
    const code = createLinkCode({ userId: req.user.id, channel });
    return res.json({
      channel,
      code,
      expiresInSeconds: 600,
      publicNumber: config.whatsappPublicNumber,
      instructions: `Message CONNECT ${code} to the PhishGuard WhatsApp number.`,
    });
  }
  return res.status(400).json({ error: 'Unsupported messaging channel.' });
}));

router.delete('/:channel', requireAuth, (req, res) => {
  const { channel } = req.params;
  if (!['telegram', 'whatsapp'].includes(channel)) {
    return res.status(400).json({ error: 'Unsupported messaging channel.' });
  }
  unlinkIntegration({ userId: req.user.id, channel });
  res.json({ ok: true, channel });
});

module.exports = router;
