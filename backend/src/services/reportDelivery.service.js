'use strict';

const { db } = require('../db');
const { sendDocument: sendTelegramDocument } = require('./telegram.service');
const { sendDocument: sendWhatsAppDocument } = require('./whatsapp.service');

async function deliverReport(userId, jobId, pdf) {
  const user = db.prepare(
    'SELECT telegram_chat_id, whatsapp_jid FROM users WHERE id = ?'
  ).get(userId);
  if (!user) return;

  const outcomes = {
    telegram: user.telegram_chat_id ? 'pending' : 'not_connected',
    whatsapp: user.whatsapp_jid ? 'pending' : 'not_connected',
  };
  const deliveries = [];
  if (user.telegram_chat_id) {
    deliveries.push(sendTelegramDocument(user.telegram_chat_id, pdf, `phishguard-report-${jobId}.pdf`)
      .then(() => { outcomes.telegram = 'sent'; })
      .catch((error) => {
        outcomes.telegram = 'failed';
        console.error(`[report] Telegram delivery for job ${jobId} failed: ${error.message}`);
      }));
  }
  if (user.whatsapp_jid) {
    deliveries.push(sendWhatsAppDocument(user.whatsapp_jid, pdf, `phishguard-report-${jobId}.pdf`)
      .then(() => { outcomes.whatsapp = 'sent'; })
      .catch((error) => {
        outcomes.whatsapp = 'failed';
        console.error(`[report] WhatsApp delivery for job ${jobId} failed: ${error.message}`);
      }));
  }
  await Promise.all(deliveries);

  db.prepare('UPDATE analysis_jobs SET delivery_status = ? WHERE id = ?')
    .run(JSON.stringify(outcomes), jobId);
}

module.exports = { deliverReport };
