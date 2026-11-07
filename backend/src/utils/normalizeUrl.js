'use strict';

function normalizeUrl(raw) {
  let value = raw.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('That does not look like a valid link.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Enter a website address using http or https.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes('.')) {
    throw new Error('Enter a website address, such as example.com.');
  }

  const normalized = `${parsed.protocol}//${host}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}${parsed.search}`;
  const normalizedLower = normalized.toLowerCase();

  return {
    normalized,
    normalizedLower,
    host,
    protocol: parsed.protocol,
    hash: require('crypto').createHash('sha256').update(normalizedLower).digest('hex'),
  };
}

module.exports = { normalizeUrl };
