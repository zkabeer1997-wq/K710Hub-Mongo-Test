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

// ---- Home / Glossary / Guides pages -------------------------------------------------

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const hyphen = (k) => k.replace(/_/g, '-');

test('registry: four pages, every field valid and within limits', () => {
  assert.deepEqual(pt.pageList().map((p) => p.id), ['home', 'about', 'glossary', 'guides']);
  for (const page of pt.pageList()) {
    const def = pt.getPageDef(page.id);
    assert.ok(def.description && Array.isArray(def.notEditable) && def.notEditable.length, page.id);
    const keys = new Set();
    for (const field of def.fields) {
      assert.ok(!keys.has(field.key), `duplicate ${field.key}`); keys.add(field.key);
      assert.ok(field.label && field.help && ['text', 'paragraph', 'link-label', 'list'].includes(field.kind), `${page.id}.${field.key}`);
      assert.ok(def.sections.some((s) => s.id === field.section), `${page.id}.${field.key} section`);
      if (field.kind !== 'list') assert.ok(def.defaults[field.key].length > 0 && def.defaults[field.key].length <= field.maxLength, `${page.id}.${field.key} default length`);
    }
    for (const k of Object.keys(def.defaults)) assert.ok(keys.has(k), `${page.id}.${k} has no field`);
  }
});

test('golden: Home defaults are the copy the page showed, and the page reads every key', () => {
  const H = pt.HOME_TEXT_DEFAULTS;
  assert.equal(H.hero_title, 'Welcome to Kingdom 710.');
  assert.equal(H.hero_kicker, 'Kingshot · Kingdom 710');
  assert.match(H.hero_sub, /^We are a multilingual Kingshot kingdom with three alliances: 710, RED, and SKY\./);
  assert.equal(H.why_1_title, 'Alliance Bear Hunt times');
  assert.equal(H.why_2_title, 'Vetted for commitment, not just power');
  assert.equal(H.wb_1_desc, 'Two Bear Hunts each day.\n\nR5: Yumin');
  assert.equal(H.wb_2_desc, 'Three Bear Hunts each day.\n\nR5: Woff');
  assert.equal(H.deck_head_title, 'What do you need?');
  assert.equal(H.final_title, 'Interested in moving\nto Kingdom 710?');
  assert.equal(H.hero_apply_label, 'Apply to transfer');
  assert.equal(H.strip_2_label, 'MEMBER FORMS');
  const page = src('app/page.js');
  for (const field of pt.getPageDef('home').fields) assert.ok(page.includes(field.key) || page.includes(hyphen(field.key)) || page.includes(`t.${field.key}`), `${field.key} unused in app/page.js`);
  assert.ok(!page.includes('COPY_REWRITES') && !page.includes('HomeEditableText'));
});

test('golden: Glossary defaults equal lib/glossary.js and the page reads them', async () => {
  const { GLOSSARY_GROUPS } = await import('../lib/glossary.js');
  const G = pt.GLOSSARY_TEXT_DEFAULTS;
  assert.equal(G.hero_title, 'Glossary');
  assert.equal(G.glossary_terms.length, GLOSSARY_GROUPS.reduce((n, g) => n + g.terms.length, 0));
  assert.deepEqual(pt.groupGlossaryTerms(G.glossary_terms), GLOSSARY_GROUPS.map((g) => ({ heading: g.heading, terms: g.terms.map((x) => ({ term: x.term, definition: x.definition })) })));
  assert.equal(G.footer_note, 'Missing one? Ask on the transfer form and we will add it.');
  const page = src('app/glossary/page.js');
  for (const field of pt.getPageDef('glossary').fields) assert.ok(page.includes(`t.${field.key}`), `${field.key} unused in app/glossary/page.js`);
});

test('golden: Guides defaults equal the listing copy; the page and directory read every key', () => {
  const U = pt.GUIDES_TEXT_DEFAULTS;
  assert.equal(U.hero_title, 'Guides');
  assert.equal(U.archive_title, 'Find a guide');
  assert.equal(U.search_placeholder, 'Search by title or description…');
  assert.equal(U.empty_search, 'No guides match your search.');
  assert.equal(U.empty_category, 'No published guides in this category yet.');
  assert.equal(U.load_error, 'Guides could not be loaded. Please try again.');
  const both = src('app/guides/page.js') + src('app/guides/GuidesDirectory.js');
  for (const field of pt.getPageDef('guides').fields) {
    const k = field.key;
    const used = both.includes(`t.${k}`) || both.includes(`copy.${k}`) || both.includes(`'${k}'`) || /^band_\d_/.test(k);
    assert.ok(used, `${k} unused`);
  }
  assert.ok(both.includes('band_${n}_kicker') && both.includes('band_${n}_title') && both.includes('band_${n}_text'));
  // guide content itself is never part of this registry
  assert.ok(!pt.getPageDef('guides').fields.some((f2) => /body|slug|f2p|spender/.test(f2.key)));
});

test('About reads the shared story paragraphs and leaders from the Home registry', () => {
  const about = src('app/about/page.js');
  assert.ok(about.includes("getPageText('home')") && about.includes('home.why_2_body') && about.includes('home.wb_1_desc'));
  assert.ok(!about.includes('getHomeContent'));
  assert.ok(pt.getPageDef('about').sections.find((s) => s.id === 'story').help.includes('Home'));
});

test('validation: list limits for glossary terms', () => {
  const t = (i) => ({ group: 'G', term: `Term ${i}`, definition: `Def ${i}` });
  assert.equal(pt.validatePageUpdate('glossary', { glossary_terms: Array.from({ length: 200 }, (_, i) => t(i)) }).set.glossary_terms.length, 200);
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: Array.from({ length: 201 }, (_, i) => t(i)) }), (e) => /at most 200/.test(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: [{ ...t(1), term: 'x'.repeat(61) }] }), (e) => /too long/.test(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: [{ ...t(1), definition: 'x'.repeat(601) }] }), (e) => /too long/.test(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: [{ ...t(1), group: ' ' }] }), (e) => /group/.test(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: [t(1), { ...t(2), term: 'term 1' }] }), (e) => /repeats/.test(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: 'x' }), (e) => Boolean(e.fields.glossary_terms));
  assert.throws(() => pt.validatePageUpdate('glossary', { glossary_terms: [{ term: 'a', definition: 'b' }] }), (e) => Boolean(e.fields.glossary_terms));
  assert.deepEqual(pt.validatePageUpdate('glossary', { glossary_terms: [] }).reset, ['glossary_terms']);
  assert.deepEqual(pt.validatePageUpdate('glossary', { glossary_terms: pt.GLOSSARY_DEFAULT_TERMS.map((x) => ({ ...x })) }).reset, ['glossary_terms']);
  // extra item properties are dropped
  assert.deepEqual(pt.validatePageUpdate('glossary', { glossary_terms: [{ ...t(1), evil: '<b>' }] }).set.glossary_terms, [t(1)]);
});

test('validation: other pages reject unknown keys, long text and wrong types', () => {
  for (const page of ['home', 'glossary', 'guides']) {
    assert.throws(() => pt.validatePageUpdate(page, { nope: 'x' }), (e) => Boolean(e.fields.nope));
    assert.throws(() => pt.validatePageUpdate(page, { hero_title: 'x'.repeat(81) }), (e) => /Too long/.test(e.fields.hero_title));
    assert.throws(() => pt.validatePageUpdate(page, { hero_title: ['x'] }), (e) => Boolean(e.fields.hero_title));
  }
  assert.deepEqual(pt.validatePageUpdate('home', { final_title: 'A\r\n\r\n\r\nB' }).set, { final_title: 'A\n\nB' });
  assert.deepEqual(pt.validatePageUpdate('guides', { filter_all: pt.GUIDES_TEXT_DEFAULTS.filter_all }).reset, ['filter_all']);
  assert.equal(pt.validatePageUpdate('home', { hero_title: '<script>x</script>' }).set.hero_title, '<script>x</script>', 'stored as plain text; React escapes it');
});

test('glossary: override merge, grouping and tooltip lookup with overrides', async () => {
  const lookup = await import('../lib/glossaryLookup.mjs');
  assert.equal(pt.glossaryOverrideForClient(pt.GLOSSARY_DEFAULT_TERMS), null);
  assert.equal(pt.glossaryOverrideForClient(undefined), null);
  const merged = pt.mergePageText('glossary', { glossary_terms: [{ group: 'A', term: 'Bear Hunt', definition: 'Edited.' }, { group: 'B', term: 'New Thing (NT)', definition: 'Fresh.' }, { group: '', term: 'bad', definition: 'x' }] });
  assert.equal(merged.glossary_terms.length, 2, 'incomplete items dropped');
  const over = pt.glossaryOverrideForClient(merged.glossary_terms);
  assert.deepEqual(over[0], { term: 'Bear Hunt', definition: 'Edited.' });
  assert.equal(lookup.lookupDefinition('bear hunt', over).definition, 'Edited.');
  assert.equal(lookup.lookupDefinition('New Thing', over)?.definition, 'Fresh.');
  assert.equal(lookup.lookupDefinition('KvK', over), null, 'a removed term has no tooltip');
  assert.match(lookup.lookupDefinition('Bear Hunt').definition, /daily alliance event/, 'no override = built-in list');
  assert.deepEqual(pt.groupGlossaryTerms(merged.glossary_terms).map((g) => g.heading), ['A', 'B']);
  const term = src('components/ui/Term.jsx');
  assert.ok(term.includes('useGlossaryTerms') && !term.includes('await'));
  assert.ok(src('app/layout.js').includes('GlossaryProvider terms={glossaryTerms}'));
});

test('legacy Home values: imported from content_blocks, reset really resets, nothing lost', async () => {
  const hc = await import('../lib/homeCopy.mjs');
  const H = pt.HOME_TEXT_DEFAULTS;
  const row = (key, text) => ({ content: { key, text } });
  const out = hc.resolveHomeLegacy([
    row('hero-title', 'Custom headline'),
    row('hero-sub', hc.COPY_REWRITES['hero-sub'].from[0]), // old promo copy -> default, nothing to import
    row('why-2-body', 'Custom why two'),
    row('why-1-title', 'ignored: fixed in code'),
    row('wb-1-desc', 'Two hunts.\n\nR5: Someone'),
    row('hero-kicker', 'KINGDOM 710 · KINGSHOT'),
    row('why-3-title', '   '),
  ], H);
  assert.deepEqual(out, { hero_title: 'Custom headline', why_2_body: 'Custom why two', wb_1_desc: 'Two hunts.\n\nR5: Someone' });

  state.tables.content_blocks = [{ page: 'home', type: 'text', content: { key: 'hero-title', text: 'Stored headline' } }, { page: 'home', type: 'text', content: { key: 'wb-2-desc', text: 'Three.\n\nR5: Zed' } }];
  server.invalidatePageText();
  const t1 = await server.getPageText('home');
  assert.equal(t1.hero_title, 'Stored headline');
  assert.equal(t1.hero_lede, undefined);
  assert.equal(t1.wb_2_desc, 'Three.\n\nR5: Zed');
  assert.equal(t1.hero_kicker, H.hero_kicker);
  const doc = state.tables.page_text.find((d) => d.page === 'home');
  assert.equal(doc.legacy_imported, true);
  assert.equal(doc.values.hero_title, 'Stored headline');

  // Saved on Home -> shows for About through the shared registry (same getPageText('home')).
  const put = await route.PUT(req(true, { page: 'home', values: { why_2_body: 'Shared paragraph' } }));
  assert.equal(put.status, 200);
  assert.equal((await server.getPageText('home')).why_2_body, 'Shared paragraph');
  // Reset to default really resets (legacy is not consulted again).
  const reset = await route.PUT(req(true, { page: 'home', values: { hero_title: H.hero_title } }));
  const body = await reset.json();
  assert.equal(body.values.hero_title, H.hero_title);
  assert.ok(!body.overridden.includes('hero_title'));
  assert.equal((await server.getPageText('home')).hero_title, H.hero_title);
  assert.equal((await server.getPageText('home')).wb_2_desc, 'Three.\n\nR5: Zed');
  // cleanup
  state.tables.content_blocks = [];
  await route.PUT(req(true, { page: 'home', values: { why_2_body: '', wb_2_desc: '' } }));
  server.invalidatePageText();
});

test('API: every page saves, reads back, resets; About values keep their shape', async () => {
  for (const [page, values] of [['guides', { hero_title: 'Guides!', filter_all: 'Everything' }], ['glossary', { hero_title: 'Words', glossary_terms: [{ group: 'G', term: 'T', definition: 'D' }] }], ['about', { hero_title: 'About!' }]]) {
    const res = await route.PUT(req(true, { page, values }));
    assert.equal(res.status, 200, page);
    const j = await res.json();
    assert.equal(j.page.id, page);
    assert.ok(j.page.description && j.pages.length === 4);
    assert.equal((await server.getPageText(page)).hero_title, values.hero_title);
  }
  const doc = state.tables.page_text.find((d) => d.page === 'about');
  assert.deepEqual(Object.keys(doc.values), ['hero_title'], 'document shape: { page, values: {key: value} }');
  assert.equal(await server.getGlossaryOverride().then((o) => o.length), 1);
  for (const page of ['guides', 'glossary', 'about']) {
    const cur = await (await route.GET(req(true, null, `http://localhost/api/admin-page-text?page=${page}`))).json();
    await route.PUT(req(true, { page, values: Object.fromEntries(cur.overridden.map((k) => [k, k === 'glossary_terms' ? [] : ''])) }));
  }
  assert.equal(await server.getGlossaryOverride(), null);
  assert.equal((await route.GET(req(false, null, 'http://localhost/api/admin-page-text?page=home'))).status, 401);
  assert.equal((await route.PUT(req(false, { page: 'guides', values: { hero_title: 'x' } }))).status, 401);
  assert.equal((await route.GET(req(true, null, 'http://localhost/api/admin-page-text?page=nope'))).status, 404);
});

test('fail-open: every page falls back to its defaults when Mongo is down', async () => {
  state.fail = true; server.invalidatePageText();
  for (const page of ['home', 'about', 'glossary', 'guides']) {
    assert.deepEqual(await server.getPageText(page), { ...pt.getPageDef(page).defaults }, page);
  }
  assert.equal(await server.getGlossaryOverride(), null);
  state.fail = false; server.invalidatePageText();
});
