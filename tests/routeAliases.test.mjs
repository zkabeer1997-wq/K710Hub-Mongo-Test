import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(lib\/)?(adminAuth|memberAuth|sameOrigin)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
});

const A = await import('../lib/routeAliases.mjs');
const { loadProxyAliasMap, resetProxyAliasCache } = await import('../lib/routeAliasesProxy.mjs');
const { proxy } = await import('../proxy.js');
const { NextRequest } = await import('next/server.js');

test('allowlist covers every app/ top-level route', () => {
  const dirs = readdirSync(new URL('../app', import.meta.url))
    .filter((n) => statSync(new URL(`../app/${n}`, import.meta.url)).isDirectory())
    .filter((n) => !n.startsWith('_') && !n.startsWith('('));
  const known = new Set([...A.RENAMEABLE_ROUTES.map((r) => r.path.slice(1)), ...A.PROTECTED_APP_ENTRIES]);
  for (const d of dirs) assert.ok(known.has(d), `app/${d} is neither renameable nor protected: classify it in lib/routeAliases.mjs`);
  for (const r of A.RENAMEABLE_ROUTES) assert.ok(dirs.includes(r.path.slice(1)) , `${r.path} has no app/ directory`);
});

test('validation matrix', () => {
  const ok = (to, ex) => A.validateAlias('/guides', to, ex).ok;
  assert.equal(ok('/guides-lol'), true);
  assert.equal(ok('/g2'), true);
  for (const bad of ['', '/', '/api', '/api/x', '/admin', '/admin-x/y', '/_next', '/gate', '/Guides', '/gu ides', '/a..b', '/../x', '/guides/', '/guides-lol/', '/a/b', 'guides-lol', '/guides', '/help', '/about', '/-x', '/x-', '/x--y', '/x_y', '/x.y', '/sitemap', '/robots', '/' + 'a'.repeat(60)]) {
    assert.equal(ok(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(ok('/' + 'a'.repeat(59)), true);
  assert.equal(A.validateAlias('/admin', '/x').ok, false);
  assert.equal(A.validateAlias('/', '/x').ok, false);
  assert.equal(A.validateAlias('/api', '/x').ok, false);
  assert.equal(A.validateAlias('/unknown', '/x').ok, false);
  assert.equal(ok('/taken', [{ from: '/help', to: '/taken' }]), false);
  assert.equal(ok('/taken', [{ from: '/guides', to: '/taken' }]), true, 'same row may be re-saved');
});

test('buildAliasMap drops invalid and colliding rows', () => {
  const map = A.buildAliasMap([
    { from: '/guides', to: '/guides-lol' },
    { from: '/help', to: '/guides-lol' },
    { from: '/admin', to: '/x' },
    { from: '/about', to: '/events' },
    { from: '/events', to: '/Bad' },
  ]);
  assert.deepEqual(map, { '/guides': '/guides-lol' });
});

test('resolveAlias rewrite, redirect, sub-paths, protected paths', () => {
  const m = { '/guides': '/guides-lol', '/tools': '/toolbox' };
  assert.deepEqual(A.resolveAlias('/guides-lol', m), { action: 'rewrite', pathname: '/guides' });
  assert.deepEqual(A.resolveAlias('/guides-lol/abc', m), { action: 'rewrite', pathname: '/guides/abc' });
  assert.deepEqual(A.resolveAlias('/guides', m), { action: 'redirect', pathname: '/guides-lol' });
  assert.deepEqual(A.resolveAlias('/guides/abc', m), { action: 'redirect', pathname: '/guides-lol/abc' });
  assert.equal(A.resolveAlias('/guides-lolx', m).action, 'none');
  assert.equal(A.resolveAlias('/', m).action, 'none');
  assert.equal(A.resolveAlias('/api/guides', m).action, 'none');
  assert.equal(A.resolveAlias('/admin/dashboard/guides', m).action, 'none');
  assert.equal(A.publicPath('/guides/x', m), '/guides-lol/x');
  assert.equal(A.publicPath('/help', m), '/help');
});

test('no redirect loops: following the redirect never redirects again', () => {
  for (const r of A.RENAMEABLE_ROUTES) {
    const m = { [r.path]: `${r.path}-new` };
    const first = A.resolveAlias(r.path, m);
    assert.equal(first.action, 'redirect');
    assert.equal(A.resolveAlias(first.pathname, m).action, 'rewrite');
    const rewritten = A.resolveAlias(first.pathname, m).pathname;
    assert.equal(rewritten, r.path); // internal only: proxy does not re-run on the rewrite target
  }
});

// ---- proxy ----
const realFetch = globalThis.fetch;
function mockAliases(aliases) {
  resetProxyAliasCache();
  globalThis.fetch = async () => new Response(JSON.stringify({ aliases }), { status: 200 });
}
const call = (path, headers = {}) => proxy(new NextRequest(`https://k710.example${path}`, { headers: { host: 'k710.example', ...headers } }));

test('proxy: rewrite for new address, 308 redirect for old, query kept', async () => {
  mockAliases({ '/guides': '/guides-lol' });
  const rw = await call('/guides-lol/my-slug?x=1');
  assert.equal(rw.status, 200);
  assert.match(rw.headers.get('x-middleware-rewrite'), /\/guides\/my-slug\?x=1$/);
  assert.ok(rw.headers.get('content-security-policy'));
  const rd = await call('/guides/my-slug?x=1&y=2');
  assert.equal(rd.status, 308);
  assert.equal(rd.headers.get('location'), 'https://k710.example/guides-lol/my-slug?x=1&y=2');
  assert.equal(rd.headers.get('cache-control'), 'no-store');
  assert.ok(rd.headers.get('content-security-policy'));
  assert.equal((await call('/about')).headers.get('location'), null);
  globalThis.fetch = realFetch;
});

test('proxy: member gating applies to the canonical path through the alias', async () => {
  mockAliases({ '/tools': '/toolbox' });
  const res = await call('/toolbox/charm');
  assert.equal(res.status, 307);
  const loc = new URL(res.headers.get('location'));
  assert.equal(loc.pathname, '/dashboard');
  assert.equal(loc.searchParams.get('next'), '/toolbox/charm');
  globalThis.fetch = realFetch;
});

test('proxy: admin and api never aliased; fail-open when map cannot load', async () => {
  mockAliases({ '/guides': '/guides-lol' });
  assert.equal((await call('/admin/dashboard/guides')).status, 307); // admin login redirect, not alias
  assert.match((await call('/admin/dashboard/guides')).headers.get('location'), /\/admin\/login$/);
  resetProxyAliasCache();
  globalThis.fetch = async () => { throw new Error('down'); };
  const res = await call('/guides');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-middleware-rewrite'), null);
  assert.equal(res.headers.get('location'), null);
  resetProxyAliasCache();
  globalThis.fetch = async () => new Response('x', { status: 500 });
  assert.deepEqual(await loadProxyAliasMap('https://k710.example'), {});
  globalThis.fetch = realFetch;
  resetProxyAliasCache();
});

test('api routes use a superadmin-only helper, never the admin-password cookie', () => {
  const access = readFileSync(new URL('../lib/routeAliasesAccess.server.js', import.meta.url), 'utf8');
  assert.match(access, /session\?\.role === 'superadmin'/);
  assert.doesNotMatch(access, /isValidAdminToken|ADMIN_COOKIE_NAME/);
  const route = readFileSync(new URL('../app/api/admin-route-aliases/route.js', import.meta.url), 'utf8');
  assert.equal((route.match(/requireRouteSuperadmin\(request\)/g) || []).length, 3);
  assert.match(route, /export const PUT/);
});
