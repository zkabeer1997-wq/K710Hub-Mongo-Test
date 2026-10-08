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

const { proxy } = await import('../proxy.js');
const { NextRequest } = await import('next/server.js');

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('{}', { status: 200 });

test('page CSP frames only YouTube (no-cookie) and Google Drive; the rest stays strict', async () => {
  const res = await proxy(new NextRequest('https://k710.example/guides', { headers: { host: 'k710.example' } }));
  const csp = res.headers.get('Content-Security-Policy');
  assert.ok(csp, 'page responses carry a CSP');
  const directives = Object.fromEntries(csp.split('; ').map(d => [d.split(' ')[0], d.split(' ').slice(1)]));
  assert.deepEqual(directives['frame-src'], ['https://www.youtube-nocookie.com', 'https://drive.google.com']);
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.ok(!/youtube\.com |\*|unsafe-inline.*script/.test(directives['frame-src'].join(' ')));
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
  assert.equal(csp.split('frame-src').length, 2, 'exactly one frame-src directive');
});

test.after(() => { globalThis.fetch = originalFetch; });
