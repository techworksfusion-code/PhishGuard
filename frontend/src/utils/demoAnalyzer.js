export function analyzeDemoLink(raw) {
  const value = raw.trim();
  if (!value) return { error: 'Paste a link to get started.' };
  if (value.length > 2000) return { error: 'That link is too long. Try a shorter URL.' };

  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return { error: 'That does not look like a valid link.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    return { error: 'Enter a website address, such as example.com.' };
  }

  const host = parsed.hostname.toLowerCase();
  const full = normalized.toLowerCase();
  const signals = [];
  const keywords = ['free-recharge', 'win-lottery', 'lucky-draw', 'claim-prize', 'kyc-update', 'kyc-verify', 'verify-account', 'refund', 'free-gift', 'cashback-offer'];
  const matched = keywords.filter((word) => full.includes(word));

  if (matched.length) {
    signals.push({ points: Math.min(matched.length * 25, 50), title: 'Scam keyword', detail: `Contains: ${matched.join(', ')}` });
  }

  const tld = host.split('.').pop();
  if (['xyz', 'top', 'tk', 'click', 'icu', 'buzz', 'gq', 'ml', 'cf', 'work'].includes(tld)) {
    signals.push({ points: 25, title: 'Suspicious domain extension', detail: `.${tld} is often used in scams.` });
  }

  const brands = {
    sbi: ['sbi.co.in', 'onlinesbi.sbi'],
    paytm: ['paytm.com'],
    amazon: ['amazon.in', 'amazon.com'],
    jio: ['jio.com'],
    hdfc: ['hdfcbank.com'],
    phonepe: ['phonepe.com'],
  };

  for (const [brand, official] of Object.entries(brands)) {
    if (host.includes(brand) && !official.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      signals.push({ points: 40, title: 'Brand mismatch', detail: `Mentions ${brand}, but the domain does not match its official site.` });
    }
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) signals.push({ points: 30, title: 'IP address', detail: 'Uses a raw IP address instead of a domain name.' });
  if (['bit.ly', 'tinyurl.com', 'cutt.ly', 'rb.gy', 'is.gd', 't.co', 'goo.gl'].includes(host)) {
    signals.push({ points: 15, title: 'Shortened link', detail: 'The final destination is hidden.' });
  }
  if (parsed.protocol === 'http:') signals.push({ points: 10, title: 'Not secure', detail: 'This link does not use HTTPS.' });
  if (parsed.username || parsed.password || value.includes('@')) {
    signals.push({ points: 30, title: 'Misleading address', detail: 'An @ symbol can disguise the real website.' });
  }
  if (host.split('.').length > 4 || (host.match(/-/g) || []).length >= 3) {
    signals.push({ points: 10, title: 'Complex domain', detail: 'This address has an unusual number of subdomains or hyphens.' });
  }
  if (host.includes('xn--')) signals.push({ points: 30, title: 'Look-alike characters', detail: 'Punycode can be used to imitate familiar domains.' });
  if (normalized.length > 75) signals.push({ points: 5, title: 'Very long link', detail: 'Long links can make the destination harder to inspect.' });

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
  const verdict = score >= 60 ? 'Dangerous' : score >= 30 ? 'Suspicious' : 'Low risk';
  return { valid: true, host, score, verdict, signals, ai: 'unavailable' };
}
