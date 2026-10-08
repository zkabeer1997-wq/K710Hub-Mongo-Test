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
globalThis.fetch = async () => new Response('{}', { status: 200 });

const PICKER_HOSTS = ['https://apis.google.com', 'https://www.gstatic.com', 'https://docs.google.com', 'https://www.googleapis.com', 'https://*.googleusercontent.com'];
async function directives(pathname) {
  const res = await proxy(new NextRequest(`https://k710.example${pathname}`, { headers: { host: 'k710.example' } }));
  const csp = res.headers.get('Content-Security-Policy');
  assert.ok(csp, `${pathname} has a CSP`);
  return { csp, map: Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)])) };
}

test('admin pages allow only the Google Picker hosts on top of the strict base policy', async () => {
  for (const pathname of ['/admin/login', '/admin']) {
    const { map } = await directives(pathname);
    assert.ok(map['script-src'].includes('https://apis.google.com'));
    assert.ok(map['script-src'].includes('https://www.gstatic.com'));
    assert.ok(map['frame-src'].includes('https://docs.google.com'));
    assert.ok(map['frame-src'].includes('https://drive.google.com'));
    assert.ok(map['frame-src'].includes('https://www.youtube-nocookie.com'));
    assert.ok(map['connect-src'].includes('https://www.googleapis.com'));
    assert.ok(map['img-src'].includes('https://*.googleusercontent.com'));
    assert.deepEqual(map['default-src'], ["'self'"]);
    assert.ok(!map['script-src'].includes("'unsafe-inline'"));
    assert.ok(!map['script-src'].some((v) => v === '*' || v === 'https:'));
    assert.deepEqual(map['frame-ancestors'], ["'none'"]);
  }
});

test('public pages never get the Picker hosts and keep the exact video-only frame-src', async () => {
  for (const pathname of ['/', '/guides', '/interest', '/gallery', '/tools', '/administrator', '/adminx']) {
    const { csp, map } = await directives(pathname);
    for (const host of PICKER_HOSTS) assert.ok(!csp.includes(host), `${pathname} must not include ${host}`);
    assert.deepEqual(map['frame-src'], ['https://www.youtube-nocookie.com', 'https://drive.google.com']);
    assert.deepEqual(map['connect-src'], ["'self'"]);
  }
});
