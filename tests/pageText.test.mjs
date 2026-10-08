import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const state = { tables: {}, fail: false };
globalThis.__pageTextTest = state;
registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return { url: 'test:pt-empty', shortCircuit: true };
    if (/\/pageText\.server$/.test(s)) return next(s + '.js', c);
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:pt-mongo', shortCircuit: true };
    if (s === 'next/server') return next('next/server.js', c);
    if (/\/(adminAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:pt-empty') return { format: 'module', shortCircuit: true, source: 'export {};' };
    if (u === 'test:pt-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; const m=createFakeMongo(globalThis.__pageTextTest.tables); export const getCollection=async(n)=>{ if(globalThis.__pageTextTest.fail) throw new Error('mongo down'); return m.getCollection(n); }; export const ensureIndexes=m.ensureIndexes;` };
    }
    return next(u, c);
  },
});

process.env.ADMIN_PASSWORD = 'page-text-test-only';
const pt = await import('../lib/pageText.mjs');
const server = await import('../lib/pageText.server.js');
const route = await import('../app/api/admin-page-text/route.js');
const { mintAdminToken } = await import('../lib/adminAuth.js');
const token = await mintAdminToken();
const req = (admin, body, url = 'http://localhost/api/admin-page-text') => ({
  url, headers: new Headers(), cookies: { get: (k) => (admin && k === 'tff_admin_session' ? { value: token } : undefined) },
  json: async () => body,
});
const D = pt.ABOUT_TEXT_DEFAULTS;

test('defaults hold the current About copy (golden)', () => {
  assert.equal(D.hero_title, 'Three alliances. One kingdom.');
  assert.match(D.hero_lede, /^Kingdom 710 is a multilingual Kingshot kingdom made up of three alliances: 710, RED and SKY\./);
  assert.equal(D.story_heading, 'How we run things');
  assert.equal(D.record_heading, 'Our KvK record');
  assert.equal(D.alliances_heading, '710, RED and SKY');
  assert.equal(D.join_heading, 'How to join in three steps');
  assert.equal(D.step1_title, 'Send your application');
  assert.equal(D.step3_title, 'Move in when a window opens');
  assert.equal(D.faq.length, 4);
  assert.equal(D.faq[0].q, 'How long does the transfer take?');
  assert.equal(D.close_heading, 'Ready to move?');
  assert.equal(D.hero_apply_label, 'Apply to join');
  assert.equal(D.banner_small, '710 · RED · SKY');
});

test('Realm jargon is reworded in the defaults', () => {
  const all = JSON.stringify(D);
  assert.ok(!/council/i.test(all));
  assert.equal(D.close_line, 'Our officers review every application.');
  assert.match(D.step2_body, /^An officer checks your account/);
});

test('every registry field has a default within its limit and the About page reads each one', () => {
  const def = pt.getPageDef('about');
  const src = readFileSync(new URL('../app/about/page.js', import.meta.url), 'utf8');
  for (const field of def.fields) {
    assert.ok(field.label && field.help && field.section, field.key);
    assert.ok(def.sections.some((s) => s.id === field.section), field.key);
    if (field.kind !== 'list') assert.ok(D[field.key].length <= field.maxLength, `${field.key} default exceeds maxLength`);
    const used = src.includes(`t.${field.key}`) || /^step\d_/.test(field.key);
    assert.ok(used, `${field.key} is not used by app/about/page.js`);
  }
  assert.ok(src.includes('step${n}_title') && src.includes('step${n}_body') && src.includes('step${n}_link'));
  assert.equal((src.match(/<h1/g) || []).length, 0, 'h1 comes from PageHero only');
});

test('validation: unknown key, too long, wrong type', () => {
  assert.throws(() => pt.validatePageUpdate('about', { nope: 'x' }), (e) => Boolean(e.fields.nope));
  assert.throws(() => pt.validatePageUpdate('about', { hero_title: 'x'.repeat(81) }), (e) => /Too long/.test(e.fields.hero_title));
  assert.throws(() => pt.validatePageUpdate('about', { hero_title: 5 }), (e) => Boolean(e.fields.hero_title));
  assert.throws(() => pt.validatePageUpdate('nope', {}), (e) => e.status === 404);
  const ok = pt.validatePageUpdate('about', { hero_title: '  New   title ' });
  assert.deepEqual(ok.set, { hero_title: 'New title' });
});

test('validation: blank or default value means reset', () => {
  const v = pt.validatePageUpdate('about', { hero_title: '   ', close_line: D.close_line });
  assert.deepEqual(v.set, {});
  assert.deepEqual(v.reset.sort(), ['close_line', 'hero_title']);
});

test('validation: paragraph breaks kept, single-line collapses', () => {
  const v = pt.validatePageUpdate('about', { hero_lede: 'One\r\n\r\n\r\n\r\nTwo', hero_title: 'a\nb' });
  assert.equal(v.set.hero_lede, 'One\n\nTwo');
  assert.equal(v.set.hero_title, 'a b');
  assert.deepEqual(pt.splitParagraphs('One\n\nTwo\nthree'), ['One', 'Two three']);
});

test('validation: FAQ limits', () => {
  const item = (i) => ({ q: `Q${i}`, a: `A${i}` });
  assert.throws(() => pt.validatePageUpdate('about', { faq: Array.from({ length: 13 }, (_, i) => item(i)) }), (e) => Boolean(e.fields.faq));
  assert.throws(() => pt.validatePageUpdate('about', { faq: [{ q: 'x'.repeat(141), a: 'a' }] }), (e) => Boolean(e.fields.faq));
  assert.throws(() => pt.validatePageUpdate('about', { faq: [{ q: 'q', a: 'a'.repeat(801) }] }), (e) => Boolean(e.fields.faq));
  assert.throws(() => pt.validatePageUpdate('about', { faq: [{ q: 'q', a: '  ' }] }), (e) => Boolean(e.fields.faq));
  assert.throws(() => pt.validatePageUpdate('about', { faq: 'text' }), (e) => Boolean(e.fields.faq));
  assert.equal(pt.validatePageUpdate('about', { faq: Array.from({ length: 12 }, (_, i) => item(i)) }).set.faq.length, 12);
  assert.deepEqual(pt.validatePageUpdate('about', { faq: [] }).reset, ['faq']);
});

test('merge: defaults, overrides, blank and malformed fall back', () => {
  assert.deepEqual(pt.mergePageText('about', null), { ...D });
  const m = pt.mergePageText('about', { hero_title: 'Mine', hero_lede: '   ', faq: [{ q: '', a: '' }], close_line: 5 });
  assert.equal(m.hero_title, 'Mine');
  assert.equal(m.hero_lede, D.hero_lede);
  assert.deepEqual(m.faq, D.faq);
  assert.equal(m.close_line, D.close_line);
  assert.equal(pt.mergePageText('about', { faq: [{ q: 'Q', a: 'A' }] }).faq.length, 1);
});

test('cache: serves for the TTL, invalidates, fails open', async () => {
  let t = 0; let calls = 0; let fail = false; let doc = null;
  const cache = pt.createPageTextCache(async () => { calls += 1; if (fail) throw new Error('down'); return doc; }, { ttl: 30_000, nowMs: () => t });
  assert.equal((await cache.get('about')).hero_title, D.hero_title);
  doc = { values: { hero_title: 'Changed' } };
  assert.equal((await cache.get('about')).hero_title, D.hero_title);
  assert.equal(calls, 1);
  cache.invalidate('about');
  assert.equal((await cache.get('about')).hero_title, 'Changed');
  t = 31_000; fail = true;
  assert.equal((await cache.get('about')).hero_title, 'Changed', 'last good copy kept when Mongo fails');
  const cold = pt.createPageTextCache(async () => { throw new Error('down'); });
  assert.deepEqual(await cold.get('about'), { ...D });
});

test('editor helpers: dirty detection and FAQ add/remove/move', () => {
  const base = { a: 'x', faq: [{ q: '1', a: '1' }, { q: '2', a: '2' }] };
  assert.equal(pt.isDirty(base, { ...base, faq: base.faq.map((x) => ({ ...x })) }), false);
  assert.deepEqual(pt.changedKeys(base, { ...base, a: 'y' }), ['a']);
  assert.deepEqual(pt.changedKeys(base, { ...base, faq: pt.faqMove(base.faq, 0, 1) }), ['faq']);
  assert.deepEqual(pt.faqMove(base.faq, 0, -1), base.faq);
  assert.deepEqual(pt.faqMove(base.faq, 1, -1).map((x) => x.q), ['2', '1']);
  assert.equal(pt.faqRemove(base.faq, 0).length, 1);
  assert.deepEqual(pt.faqAdd(base.faq).at(-1), { q: '', a: '' });
  assert.equal(pt.faqAdd(Array.from({ length: 12 }, () => ({ q: 'q', a: 'a' }))).length, 12);
});

test('API: 401 without admin on GET and PUT', async () => {
  assert.equal((await route.GET(req(false))).status, 401);
  assert.equal((await route.PUT(req(false, { values: { hero_title: 'x' } }))).status, 401);
});

test('API: save, public read after invalidation, reset, errors, Mongo down', async () => {
  const get = await route.GET(req(true));
  const first = await get.json();
  assert.equal(first.values.hero_title, D.hero_title);
  assert.ok(first.fields.length > 20 && first.sections.length >= 7);

  assert.equal((await server.getPageText('about')).hero_lede, D.hero_lede); // cached
  const put = await route.PUT(req(true, { page: 'about', values: { hero_lede: 'Fresh lede', faq: [{ q: 'Q?', a: 'A.' }] } }));
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.equal(saved.values.hero_lede, 'Fresh lede');
  assert.deepEqual(saved.overridden.sort(), ['faq', 'hero_lede']);
  assert.equal(saved.updated_by, 'admin');
  assert.equal((await server.getPageText('about')).hero_lede, 'Fresh lede', 'cache invalidated by the write');
  assert.equal(state.tables.page_text.length, 1);

  const bad = await route.PUT(req(true, { page: 'about', values: { bogus: 'x', hero_title: 'y'.repeat(200) } }));
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.ok(body.fields.bogus && body.fields.hero_title);
  assert.equal((await route.PUT(req(true, { page: 'nope', values: {} }))).status, 404);

  const reset = await route.PUT(req(true, { page: 'about', values: { hero_lede: '', faq: [] } }));
  assert.deepEqual((await reset.json()).overridden, []);
  assert.equal((await server.getPageText('about')).hero_lede, D.hero_lede);

  state.fail = true; server.invalidatePageText('about');
  assert.equal((await server.getPageText('about')).hero_title, D.hero_title, 'fails open to defaults');
  assert.equal((await route.GET(req(true))).status, 503);
  state.fail = false;
});
