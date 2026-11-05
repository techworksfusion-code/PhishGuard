import { isIP } from 'node:net';
import { HttpError } from './httpError.js';

const MAX_URL_LENGTH = 2000;
const blockedHostSuffixes = ['.localhost', '.local', '.internal', '.lan', '.home'];
const blockedIpv4Ranges = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function ipv4Number(address) {
  return address.split('.').reduce((value, octet) => (value * 256) + Number(octet), 0);
}

function isPublicIpv4(address) {
  const value = ipv4Number(address);
  return !blockedIpv4Ranges.some(([network, prefix]) => {
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (network & mask);
  });
}

function mappedIpv4(address) {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];

  const hexadecimal = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexadecimal) return null;
  const high = Number.parseInt(hexadecimal[1], 16);
  const low = Number.parseInt(hexadecimal[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function isPublicIpv6(address) {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const embeddedIpv4 = mappedIpv4(lower);
    return embeddedIpv4 !== null && isPublicIpv4(embeddedIpv4);
  }

  const firstGroup = Number.parseInt(lower.split(':')[0] || '0', 16);
  const secondGroup = Number.parseInt(lower.split(':')[1] || '0', 16);
  const isGlobalUnicast = (firstGroup & 0xe000) === 0x2000;
  const isProtocolAssignment = firstGroup === 0x2001 && (secondGroup & 0xfe00) === 0;
  return isGlobalUnicast && !isProtocolAssignment && !lower.startsWith('2001:db8:');
}

function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const ipVersion = isIP(host);
  if (ipVersion === 4 && !isPublicIpv4(host)) {
    throw new HttpError(422, 'Enter a publicly reachable website address.');
  }
  if (ipVersion === 6 && !isPublicIpv6(host)) {
    throw new HttpError(422, 'Enter a publicly reachable website address.');
  }
  if (ipVersion === 0 && (
    host === 'localhost'
    || blockedHostSuffixes.some((suffix) => host.endsWith(suffix))
    || !host.includes('.')
  )) {
    throw new HttpError(422, 'Enter a publicly reachable website address.');
  }
}

export function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new HttpError(400, 'A URL is required.');
  }

  const value = rawUrl.trim();
  if (value.length > MAX_URL_LENGTH) {
    throw new HttpError(413, 'URL must be 2000 characters or fewer.');
  }

  const normalizedInput = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(normalizedInput);
  } catch {
    throw new HttpError(422, 'That does not look like a valid link.');
  }

  const hostWithoutBrackets = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || (!parsed.hostname.includes('.') && isIP(hostWithoutBrackets) === 0)
  ) {
    throw new HttpError(422, 'Enter a website address, such as example.com.');
  }

  assertPublicHost(parsed.hostname);
  return {
    url: parsed.href,
    host: parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase(),
  };
}
