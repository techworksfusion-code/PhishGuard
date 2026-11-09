import test, { before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite://:memory:';
process.env.TOKEN_PEPPER = 'test-token-pepper';
process.env.ALERT_PEPPER = 'test-alert-pepper';
process.env.GEMINI_API_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.WHATSAPP_BOT_ENABLED = 'true';
process.env.WHATSAPP_PUBLIC_NUMBER = '15551234567';

const { db } = await import('../src/db/index.js');
const { createLinkCode, consumeLinkCode, getIntegrationStatus, unlinkIntegration } =
  await import('../src/services/integrations.service.js');

let userId;

before(async () => {
  const { migrate } = await import('../src/db/migrate.js');
  migrate();
  userId = Number(db.prepare('INSERT INTO users (name, phone) VALUES (?, ?)').run('Link user', '+15550000000').lastInsertRowid);
});

test('messenger codes are one-time, expire by channel, and unlink cleanly', () => {
  const oldCode = createLinkCode({ userId, channel: 'telegram' });
  const code = createLinkCode({ userId, channel: 'telegram' });

  assert.match(code, /^\d{8}$/);
  assert.equal(consumeLinkCode({ channel: 'telegram', code: oldCode, address: '111' }), false);
  assert.equal(consumeLinkCode({ channel: 'telegram', code, address: '222' }), true);
  assert.equal(consumeLinkCode({ channel: 'telegram', code, address: '333' }), false);
  assert.equal(getIntegrationStatus(userId).telegram.connected, true);
  assert.equal(unlinkIntegration({ userId, channel: 'telegram' }), true);
  assert.equal(getIntegrationStatus(userId).telegram.connected, false);
});
