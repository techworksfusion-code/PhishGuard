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

// Bare domains and explicit URLs found in an SMS body. Emails and the
// domain part of an already-matched URL are skipped to avoid duplicates.
const LINK_PATTERN = [
  'https?:\\/\\/[^\\s<>"\']+',
  'www\\.[^\\s<>"\']+',
  '(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:com|in|net|org|co|io|xyz|top|tk|ml|cf|gq|click|icu|buzz|work|info|shop|live|online|site|store|app|link|pro|club|vip|cc|ru|cn|me)(?:\\/[^\\s<>"\']*)?',
].join('|');

function extractLinks(text) {
  const found = new Map();
  const re = new RegExp(LINK_PATTERN, 'gi');
  let match;

  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const prev = start > 0 ? text[start - 1] : '';
    if (prev === '@' || prev === '/' || /[a-z0-9._-]/i.test(prev)) continue;

    let raw = match[0].replace(/[\s.,;:!?)\]}>"']+$/, '');
    if (/^www\./i.test(raw)) raw = `http://${raw}`;

    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      if (!parsed.hostname.includes('.')) continue;
      const key = `${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
      if (!found.has(key)) found.set(key, parsed.href);
    } catch {
      // Not a real link (e.g. "Rs.500") — ignore.
    }
  }

  return Array.from(found.values()).slice(0, 5);
}

function analyzeMessage(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Message is empty');

  const lower = text.toLowerCase();
  const signals = [];
  let textScore = 0;

  // Same curated keyword list as the URL engine (minus the URL-only context).
  const matchedKeywords = rules.keywords.filter((word) => lower.includes(word));
  if (matchedKeywords.length) {
    const points = Math.min(matchedKeywords.length * rules.points.scamKeyword, rules.caps.scamKeywordMax);
    signals.push({ name: 'Scam keyword', points, detail: `Contains: ${matchedKeywords.join(', ')}` });
    textScore += points;
  }

  // Full-sentence social-engineering patterns.
  const negated = (rules.messageNegations || []).some((phrase) => lower.includes(phrase));
  for (const rule of rules.messagePatterns || []) {
    if (rule.skipIfNegated && negated) continue;
    if (new RegExp(rule.pattern, 'i').test(text)) {
      signals.push({ name: rule.name, points: rule.points, detail: rule.detail });
      textScore += rule.points;
    }
  }

  // Score every link; keep the evidence of the worst one.
  const links = extractLinks(text);
  let bestLink = null;
  for (const link of links) {
    try {
      const result = analyze(link);
      if (!bestLink || result.score > bestLink.score) bestLink = result;
    } catch {
      // Ignore malformed extraction.
    }
  }

  if (bestLink) {
    for (const signal of bestLink.signals) {
      signals.push({ ...signal, detail: `${signal.detail} (link: ${bestLink.host})` });
    }
    if (links.length > 1) {
      signals.push({
        name: 'Multiple links',
        points: 5,
        detail: `${links.length} links found in one message.`,
      });
      textScore += 5;
    }
  }

  const score = Math.min(rules.caps.maxScore, Math.max(textScore, bestLink ? bestLink.score : 0));

  return {
    score,
    signals,
    links,
    host: bestLink ? bestLink.host : null,
    urlHash: bestLink ? bestLink.urlHash : null,
  };
}

module.exports = { analyze, analyzeMessage, extractLinks };
