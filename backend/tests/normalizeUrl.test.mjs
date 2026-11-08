import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../src/utils/normalizeUrl.js';

test('defaults the scheme, lowercases the host, and keeps the path', () => {
  const result = normalizeUrl(' Example.COM/Path ');

  assert.equal(result.normalized, 'https://example.com/Path');
  assert.equal(result.normalizedLower, 'https://example.com/path');
  assert.equal(result.host, 'example.com');
  assert.equal(result.protocol, 'https:');
  assert.match(result.hash, /^[a-f0-9]{64}$/);
});

test('hashing is case-insensitive but path-sensitive', () => {
  const a = normalizeUrl('https://EXAMPLE.com/Path');
  const b = normalizeUrl('https://example.com/Path');
  const differentPath = normalizeUrl('https://example.com/other');

  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, differentPath.hash);
});

test('accepts http(s) and rejects unsupported protocols, malformed and hostless input', () => {
  assert.equal(normalizeUrl('http://example.com').normalized, 'http://example.com/');
  assert.throws(() => normalizeUrl('ftp://example.com'), /http or https/i);
  assert.throws(() => normalizeUrl('not a website'), /valid link/i);
  assert.throws(() => normalizeUrl('http://localhost'), /such as example\.com/i);
});
