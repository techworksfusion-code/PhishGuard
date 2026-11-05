import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../src/utils/normalizeUrl.js';

test('normalizeUrl defaults the scheme and canonicalizes the host', () => {
  assert.deepEqual(normalizeUrl(' Example.COM/Path '), {
    url: 'https://example.com/Path',
    host: 'example.com',
  });
});

test('normalizeUrl accepts HTTP(S) and rejects malformed or unsupported addresses', () => {
  assert.equal(normalizeUrl('http://example.com').url, 'http://example.com/');
  assert.throws(() => normalizeUrl(''), { status: 400 });
  assert.throws(() => normalizeUrl('x'.repeat(2001)), { status: 413 });
  assert.throws(() => normalizeUrl('ftp://example.com'), { status: 422 });
  assert.throws(() => normalizeUrl('not a website'), { status: 422 });
});

test('normalizeUrl rejects private and local destinations', () => {
  for (const url of [
    'http://localhost',
    'http://printer.local',
    'http://127.0.0.1',
    'http://10.1.2.3',
    'http://192.168.1.1',
    'http://240.0.0.1',
    'http://[::1]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://[2001:2::1]',
    'http://[2001:db8::1]',
  ]) {
    assert.throws(() => normalizeUrl(url), { status: 422 }, url);
  }
});

test('normalizeUrl accepts representative public hosts', () => {
  assert.equal(normalizeUrl('https://example.com').host, 'example.com');
  assert.equal(normalizeUrl('https://8.8.8.8').host, '8.8.8.8');
  assert.equal(normalizeUrl('https://[2606:4700:4700::1111]').host, '2606:4700:4700::1111');
});
