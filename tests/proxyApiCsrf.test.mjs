import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(lib\/)?(adminAuth|memberAuth|sameOrigin)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
});

const { proxy, config } = await import('../proxy.js');
const { NextRequest } = await import('next/server.js');

const call = (method, path, headers = {}) =>
  proxy(new NextRequest(`https://k710.example${path}`, { method, headers: { host: 'k710.example', ...headers } }));

test('proxy matcher includes /api and rejects cross-origin mutations centrally', async () => {
  assert.ok(config.matcher.some((m) => m.source === '/api/:path*'));
  const blocked = await call('POST', '/api/admin-gallery', { origin: 'https://evil.example' });
  assert.equal(blocked.status, 403);
  const ok = await call('POST', '/api/admin-gallery', { origin: 'https://k710.example' });
  assert.notEqual(ok.status, 403);
  assert.notEqual((await call('GET', '/api/guides', { origin: 'https://evil.example' })).status, 403);
  assert.notEqual((await call('POST', '/api/cron/gift-codes', { origin: 'https://evil.example' })).status, 403);
});
