'use strict';

const crypto = require('crypto');
const rules = require('./rules.json');

function isIpAddress(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isShortener(host) {
  return rules.shorteners.includes(host);
}

function hasBrandMismatch(host) {
  const matched = [];
  for (const [brand, official] of Object.entries(rules.brands)) {
    if (host.includes(brand) && !official.some((d) => host === d || host.endsWith(`.${d}`))) {
      matched.push(brand);
    }
  }
  return matched;
}

function analyze(rawUrl) {
  let normalized;
  try {
    let value = rawUrl.trim();
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.')) {
      throw new Error('No hostname');
    }
    normalized = `${parsed.protocol}//${host}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}${parsed.search}`;
  } catch {
    throw new Error('Invalid URL');
  }

  const full = normalized.toLowerCase();
  const host = new URL(normalized).hostname.toLowerCase();
  const signals = [];
  let score = 0;

  // Scam keywords
  const matched = rules.keywords.filter((word) => full.includes(word));
  if (matched.length) {
    const points = Math.min(matched.length * rules.points.scamKeyword, rules.caps.scamKeywordMax);
    signals.push({ name: 'Scam keyword', points, detail: `Contains: ${matched.join(', ')}` });
    score += points;
  }

  // Suspicious TLD
  const tld = host.split('.').pop();
  if (rules.suspiciousTlds.includes(tld)) {
    signals.push({ name: 'Suspicious domain extension', points: rules.points.suspiciousTld, detail: `.${tld} is often used in scams.` });
    score += rules.points.suspiciousTld;
  }

  // Brand mismatch
  const brands = hasBrandMismatch(host);
  if (brands.length) {
    signals.push({ name: 'Brand mismatch', points: rules.points.brandMismatch, detail: `Mentions ${brands.join(', ')} but the domain does not match its official site.` });
    score += rules.points.brandMismatch;
  }

  // IP address
  if (isIpAddress(host)) {
    signals.push({ name: 'IP address', points: rules.points.ipAddress, detail: 'Uses a raw IP address instead of a domain name.' });
    score += rules.points.ipAddress;
  }

  // Shortened link
  if (isShortener(host)) {
    signals.push({ name: 'Shortened link', points: rules.points.shortenedLink, detail: 'The final destination is hidden.' });
    score += rules.points.shortenedLink;
  }

  // Not secure
  if (normalized.startsWith('http:')) {
    signals.push({ name: 'Not secure', points: rules.points.notSecure, detail: 'This link does not use HTTPS.' });
    score += rules.points.notSecure;
  }

  // Misleading address (@ symbol)
  if (rawUrl.includes('@')) {
    signals.push({ name: 'Misleading address', points: rules.points.misleadingAddress, detail: 'An @ symbol can disguise the real website.' });
    score += rules.points.misleadingAddress;
  }

  // Complex domain
  if (host.split('.').length > 4 || (host.match(/-/g) || []).length >= 3) {
    signals.push({ name: 'Complex domain', points: rules.points.complexDomain, detail: 'This address has an unusual number of subdomains or hyphens.' });
    score += rules.points.complexDomain;
  }

  // Look-alike characters (punycode)
  if (host.includes('xn--')) {
    signals.push({ name: 'Look-alike characters', points: rules.points.lookAlikeCharacters, detail: 'Punycode can be used to imitate familiar domains.' });
    score += rules.points.lookAlikeCharacters;
  }

  // Very long link
  if (normalized.length > 75) {
    signals.push({ name: 'Very long link', points: rules.points.veryLongLink, detail: 'Long links can make the destination harder to inspect.' });
    score += rules.points.veryLongLink;
  }

  const finalScore = Math.min(rules.caps.maxScore, score);
  const urlHash = crypto.createHash('sha256').update(normalized.toLowerCase()).digest('hex');

  return {
    normalized,
    host,
    urlHash,
    score: finalScore,
    signals,
  };
}

module.exports = { analyze };
