'use strict';

const config = require('../config');

async function telegramApi(method, fields) {
  if (!config.telegramBotToken) throw new Error('Telegram bot is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: 'POST',
    body: fields,
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram ${method} request failed.`);
  }
  return result.result;
}

async function getBotUsername() {
  const bot = await telegramApi('getMe', new URLSearchParams());
  return typeof bot.username === 'string' ? bot.username : null;
}

async function sendMessage(chatId, text) {
  const fields = new URLSearchParams({ chat_id: String(chatId), text });
  await telegramApi('sendMessage', fields);
}

async function sendDocument(chatId, pdf, filename) {
  const fields = new FormData();
  fields.append('chat_id', String(chatId));
  fields.append('document', new Blob([pdf], { type: 'application/pdf' }), filename);
  await telegramApi('sendDocument', fields);
}

module.exports = { getBotUsername, sendDocument, sendMessage };
