import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TEMPLATES, addBlock, areaIds, blockToMarkdown, collectImages, createBlock, duplicateBlock, emptyLayout, findBlock, imagesMissingAlt,
  layoutBlocks, layoutHeadings, layoutToMarkdown, markdownToBlocks, markdownToLayout, moveBlock, nudgeBlock, removeBlock,
  sanitizeImageSrc, sanitizeMarkdown, sanitizeUrl, switchTemplate, updateBlock, validateLayout, youtubeId,
} from '../lib/guideLayout.mjs';
import { createHistory, pushHistory, redoHistory, undoHistory, HISTORY_LIMIT } from '../lib/guideHistory.mjs';
import { toggleList, wrapSelection } from '../lib/guideTextFormat.mjs';
import { validateGuide, validateDraft } from '../lib/guideValidation.mjs';

const block = (type, patch = {}) => ({ ...createBlock(type), ...patch });
const sample = () => {
  let layout = emptyLayout('sidebar-right');
  layout = addBlock(layout, 'main', block('heading', { id: 'h1', text: 'Intro' }));
  layout = addBlock(layout, 'main', block('text', { id: 't1', md: 'Hello **world**' }));
  layout = addBlock(layout, 'sidebar', block('callout', { id: 'c1', tone: 'warn', title: 'Careful', md: 'Mind the gap' }));
  return layout;
};

test('there are at least five templates with unique, named areas', () => {
  assert.ok(TEMPLATES.length >= 5);
  for (const t of TEMPLATES) {
    assert.equal(new Set(t.areas.map(a => a.id)).size, t.areas.length);
    assert.ok(t.areas.some(a => a.role === 'main'));
  }
  assert.deepEqual(areaIds('hero-steps'), ['hero', 'steps', 'callout']);
});

test('validateLayout accepts every template and block type and normalizes values', () => {
  for (const t of TEMPLATES) assert.ok(validateLayout(emptyLayout(t.id)).layout);
  let layout = emptyLayout('article');
  for (const type of ['heading', 'text', 'image', 'imagegrid', 'callout', 'divider', 'button', 'video', 'table']) layout = addBlock(layout, 'main', createBlock(type));
  const { layout: ok, error } = validateLayout(layout);
  assert.equal(error, undefined);
  assert.equal(layoutBlocks(ok).length, 9);
  const odd = validateLayout({ ...emptyLayout('article'), areas: { header: [], main: [{ id: 'x', type: 'heading', level: 9, text: '  A\n\nB ' }] } });
  assert.equal(odd.layout.areas.main[0].level, 2);
  assert.equal(odd.layout.areas.main[0].text, ' A B ');
});

test('validateLayout rejects unknown block types, areas, versions, templates and oversize payloads', () => {
  const base = emptyLayout('article');
  assert.match(validateLayout({ ...base, areas: { ...base.areas, main: [{ type: 'script', src: 'x' }] } }).error, /Unknown block type/);
  assert.match(validateLayout({ ...base, areas: { ...base.areas, sidebar: [] } }).error, /does not belong/);
  assert.match(validateLayout({ ...base, version: 2 }).error, /version/);
  assert.match(validateLayout({ ...base, template: 'nope' }).error, /template/);
  assert.match(validateLayout(null).error, /object/);
  const huge = { ...base, areas: { header: [], main: Array.from({ length: 301 }, () => block('divider')) } };
  assert.match(validateLayout(huge).error, /at most 300/);
  const fat = { ...base, areas: { header: [], main: [block('text', { md: 'x'.repeat(30000) }), block('text', { md: 'x'.repeat(30000) }), ...Array.from({ length: 10 }, () => block('image', { caption: 'c'.repeat(300), alt: 'a'.repeat(300), src: `data:image/png;base64,${'A'.repeat(100000)}` }))] } };
  assert.match(validateLayout(fat).error, /too large/);
  assert.match(validateLayout({ ...base, areas: { header: [], main: [block('imagegrid', { images: Array.from({ length: 5 }, () => ({ src: '', alt: '' })) })] } }).error, /at most 4/);
  assert.match(validateLayout({ ...base, areas: { header: [], main: [block('video', { url: 'https://evil.example/watch?v=aaaaaaaaaaa' })] } }).error, /YouTube/);
});

test('unsafe urls, scripts and html are stripped or refused', () => {
  assert.equal(sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeUrl('//evil.example'), '');
  assert.equal(sanitizeUrl('/guides/x'), '/guides/x');
  assert.equal(sanitizeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(sanitizeImageSrc('javascript:alert(1)'), null);
  assert.equal(sanitizeImageSrc('http://insecure.example/a.png'), null);
  assert.equal(sanitizeImageSrc('/api/guide-images/abc.png'), '/api/guide-images/abc.png');
  assert.equal(sanitizeImageSrc('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(sanitizeMarkdown('hi <script>alert(1)</script> [x](javascript:alert(1)) <https://ok.example>'), 'hi alert(1) [x](#blocked:alert(1)) <https://ok.example>');
  const bad = validateLayout({ ...emptyLayout('article'), areas: { header: [], main: [block('image', { src: 'javascript:alert(1)' })] } });
  assert.match(bad.error, /not allowed/);
  const btn = validateLayout({ ...emptyLayout('article'), areas: { header: [], main: [block('button', { label: 'Go', href: 'javascript:alert(1)' })] } });
  assert.equal(btn.layout.areas.main[0].href, '');
});

test('YouTube links are recognised, other hosts are not', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://vimeo.com/123'), '');
  assert.equal(youtubeId('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), '');
  assert.equal(youtubeId('javascript:alert(1)'), '');
});

test('add, remove, update and duplicate are immutable', () => {
  const layout = sample();
  const frozen = JSON.stringify(layout);
  const next = updateBlock(layout, 't1', { md: 'changed', type: 'divider', id: 'zzz' });
  assert.equal(JSON.stringify(layout), frozen);
  assert.equal(findBlock(next, 't1').block.md, 'changed');
  assert.equal(findBlock(next, 't1').block.type, 'text');
  assert.equal(findBlock(removeBlock(layout, 'h1'), 'h1'), null);
  const dup = duplicateBlock(layout, 't1');
  assert.notEqual(dup.id, 't1');
  assert.equal(findBlock(dup.layout, dup.id).index, 2);
  assert.equal(addBlock(layout, 'nope', block('divider')), layout);
});

test('moveBlock reorders within an area and moves between areas', () => {
  const layout = sample();
  const reordered = moveBlock(layout, 'h1', 'main', 1);
  assert.deepEqual(reordered.areas.main.map(b => b.id), ['t1', 'h1']);
  const moved = moveBlock(layout, 't1', 'sidebar', 0);
  assert.deepEqual(moved.areas.main.map(b => b.id), ['h1']);
  assert.deepEqual(moved.areas.sidebar.map(b => b.id), ['t1', 'c1']);
  assert.equal(moveBlock(layout, 'h1', 'main', 0), layout);
  assert.equal(moveBlock(layout, 'missing', 'main', 0), layout);
  assert.equal(moveBlock(layout, 'h1', 'bogus', 0), layout);
  assert.deepEqual(moveBlock(layout, 'h1', 'sidebar', 99).areas.sidebar.map(b => b.id), ['c1', 'h1']);
});

test('nudgeBlock steps through the area then into the neighbouring area', () => {
  let layout = sample();
  layout = nudgeBlock(layout, 'h1', 1);
  assert.deepEqual(layout.areas.main.map(b => b.id), ['t1', 'h1']);
  layout = nudgeBlock(layout, 'h1', 1);
  assert.deepEqual(layout.areas.sidebar.map(b => b.id), ['h1', 'c1']);
  layout = nudgeBlock(layout, 'h1', -1);
  assert.deepEqual(layout.areas.main.map(b => b.id), ['t1', 'h1']);
  assert.equal(nudgeBlock(emptyLayout('article'), 'x', 1).template, 'article');
});

test('switching templates re-homes every block and never deletes one', () => {
  const ids = layout => layoutBlocks(layout).map(x => x.block.id).sort();
  let layout = sample();
  const before = ids(layout);
  for (const t of TEMPLATES) {
    layout = switchTemplate(layout, t.id);
    assert.equal(layout.template, t.id);
    assert.deepEqual(ids(layout), before);
    assert.ok(validateLayout(layout).layout);
  }
  const hero = switchTemplate(sample(), 'hero-steps');
  assert.deepEqual(hero.areas.steps.map(b => b.id), ['h1', 't1']);
  assert.deepEqual(hero.areas.callout.map(b => b.id), ['c1']);
  const article = switchTemplate(sample(), 'article');
  assert.deepEqual(article.areas.main.map(b => b.id), ['h1', 't1', 'c1']);
});

test('markdown converts to blocks and back without losing content', () => {
  const md = [
    '## Getting started', '', 'Welcome to **the guide**.', 'Second line.', '', '- one', '- two', '',
    '### Details', '', '![Map](https://example.com/map.png)', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '---', '',
    '```js', '## not a heading', '```', '', '#### Small heading', '', 'The end.',
  ].join('\n');
  const blocks = markdownToBlocks(md);
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'text', 'heading', 'image', 'text', 'divider', 'text']);
  assert.equal(blocks[0].text, 'Getting started');
  assert.equal(blocks[2].level, 3);
  assert.equal(blocks[3].alt, 'Map');
  assert.ok(blocks[6].md.includes('## not a heading'));
  const layout = markdownToLayout(md);
  assert.ok(validateLayout(layout).layout);
  const out = layoutToMarkdown(layout);
  const squash = s => s.replace(/\s+/g, ' ').trim();
  assert.equal(squash(out), squash(md));
  assert.equal(layoutToMarkdown(markdownToLayout(out)), out);
});

test('legacy guides without alt text convert to decorative images that can still publish', () => {
  const layout = markdownToLayout('![](https://example.com/a.png)');
  assert.equal(layout.areas.main[0].decorative, true);
  assert.deepEqual(imagesMissingAlt(layout), []);
  const bare = { ...layout, areas: { ...layout.areas, main: [{ ...layout.areas.main[0], decorative: false }] } };
  assert.equal(imagesMissingAlt(bare).length, 1);
  assert.match(validateLayout(bare, { requireAlt: true }).error, /alt text/);
  assert.ok(validateLayout(bare).layout);
});

test('derived markdown covers every block type and headings expose unique anchors', () => {
  let layout = emptyLayout('article');
  layout = addBlock(layout, 'main', block('heading', { text: 'Same' }));
  layout = addBlock(layout, 'main', block('heading', { text: 'Same', level: 3 }));
  layout = addBlock(layout, 'main', block('image', { src: 'https://example.com/i.png', alt: 'Pic', caption: 'Cap' }));
  layout = addBlock(layout, 'main', block('callout', { tone: 'info', title: '', md: 'Body' }));
  layout = addBlock(layout, 'main', block('button', { label: 'Go', href: '/guides' }));
  layout = addBlock(layout, 'main', block('video', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Clip' }));
  layout = addBlock(layout, 'main', block('table', { rows: [['H1', 'H2'], ['a', 'b']] }));
  const md = layoutToMarkdown(layout);
  assert.match(md, /## Same\n\n### Same/);
  assert.match(md, /!\[Pic\]\(https:\/\/example.com\/i.png\)\n\n\*Cap\*/);
  assert.match(md, /> \*\*Note\*\*/);
  assert.match(md, /\[Go\]\(\/guides\)/);
  assert.match(md, /\[Clip\]\(https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ\)/);
  assert.match(md, /\| H1 \| H2 \|\n\| --- \| --- \|\n\| a \| b \|/);
  assert.deepEqual(layoutHeadings(layout).map(h => h.id), ['same', 'same-1']);
  assert.deepEqual(collectImages(layout), ['https://example.com/i.png']);
  assert.equal(blockToMarkdown({ type: 'divider' }), '---');
});

test('undo and redo keep a bounded history', () => {
  let h = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) h = pushHistory(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.ok(HISTORY_LIMIT >= 20);
  for (let i = 0; i < 25; i += 1) h = undoHistory(h);
  assert.equal(h.present, HISTORY_LIMIT + 10 - 25);
  h = redoHistory(h);
  assert.equal(h.present, HISTORY_LIMIT + 10 - 24);
  h = pushHistory(h, 'new');
  assert.equal(h.future.length, 0);
  assert.equal(pushHistory(h, 'new'), h);
});

test('toolbar helpers wrap selections and toggle lists', () => {
  assert.deepEqual(wrapSelection('say hi now', 4, 6, '**'), { value: 'say **hi** now', start: 6, end: 8 });
  assert.equal(wrapSelection('say **hi** now', 4, 10, '**').value, 'say hi now');
  assert.equal(wrapSelection('', 0, 0, '*').value, '*text*');
  assert.equal(toggleList('a\nb', 0, 3, false).value, '- a\n- b');
  assert.equal(toggleList('- a\n- b', 0, 7, false).value, 'a\nb');
  assert.equal(toggleList('a\nb', 0, 3, true).value, '1. a\n2. b');
});

test('validateGuide keeps body in sync with layout and enforces alt text only when publishing', () => {
  const layout = addBlock(emptyLayout('article'), 'main', block('image', { src: 'https://example.com/i.png', alt: '' }));
  const base = { slug: 'g', title: 'G', category: 'C', position: 1, layout: addBlock(layout, 'main', block('text', { md: 'Derived text' })) };
  const draft = validateGuide({ ...base, body: 'ignored', is_published: false });
  assert.match(draft.guide.body, /Derived text/);
  assert.ok(!draft.guide.body.includes('ignored'));
  assert.equal(draft.guide.layout.template, 'article');
  assert.match(validateGuide({ ...base, is_published: true }).error, /alt text/);
  assert.match(validateGuide({ ...base, layout: { version: 1, template: 'article', areas: { main: [{ type: 'iframe' }] } } }).error, /Unknown block type/);
  assert.equal('layout' in validateGuide({ slug: 'g', title: 'G', category: 'C', position: 1, body: 'classic' }).guide, false);
  assert.ok(validateDraft({ layout, title: 'x'.repeat(500) }).draft.title.length <= 180);
  assert.ok(validateDraft({ layout: { version: 1, template: 'zzz', areas: {} } }).error);
});
