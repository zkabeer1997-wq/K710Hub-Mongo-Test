import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countWords, readingMinutes, guideHeadings, shouldShowToc, linkifyBareUrls, urlLabel, guideSubtitle, guideMeta, formatGuideDate, headingIdFactory } from '../lib/guideContent.mjs';
import { validateGuide, guideSummary } from '../lib/guideValidation.mjs';

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('reading time is computed from content, with a 1 minute floor', () => {
  assert.equal(readingMinutes({ body: 'short' }), 1);
  assert.equal(readingMinutes({ body: words(600) }), 3);
  assert.equal(readingMinutes({ body: words(400), f2p_content: words(200), spender_content: words(600) }), 5);
  assert.equal(countWords('![img](https://x.test/a.png) ```code block``` https://x.test hello **world**'), 2);
  assert.equal(guideSummary({ slug: 'a', body: words(1000), f2p_content: '' }).reading_minutes, 5);
  assert.equal('body' in guideSummary({ slug: 'a', body: 'x' }), false);
});

test('headings extract h2/h3 outside code fences with unique ids', () => {
  const md = '# Title\n## Setup\ntext\n```\n## not a heading\n```\n### Setup\n## Gear & Charms!';
  const headings = guideHeadings(md);
  assert.deepEqual(headings.map(h => [h.level, h.text, h.id]), [[2, 'Setup', 'setup'], [3, 'Setup', 'setup-1'], [2, 'Gear & Charms!', 'gear-charms']]);
  const next = headingIdFactory();
  assert.deepEqual(['A b', 'A b'].map(next), ['a-b', 'a-b-1']);
});

test('TOC only for long guides with enough headings', () => {
  const heads = '## A\n## B\n## C\n';
  assert.equal(shouldShowToc(heads + words(700)), true);
  assert.equal(shouldShowToc(heads + words(50)), false);
  assert.equal(shouldShowToc('## A\n## B\n' + words(900)), false);
});

test('bare URLs become labelled links; code and existing links are untouched', () => {
  assert.equal(urlLabel('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(linkifyBareUrls('See https://www.example.com/page. Done'), 'See [example.com](https://www.example.com/page). Done');
  assert.equal(linkifyBareUrls('<https://a.io/x>'), '[a.io](https://a.io/x)');
  assert.equal(linkifyBareUrls('[https://a.io/x](https://a.io/x)'), '[a.io](https://a.io/x)');
  assert.equal(linkifyBareUrls('[Guide](https://a.io/x) and `https://b.io`'), '[Guide](https://a.io/x) and `https://b.io`');
  assert.equal(linkifyBareUrls('```\nhttps://c.io\n```'), '```\nhttps://c.io\n```');
  assert.equal(linkifyBareUrls('![pic](https://a.io/p.png)'), '![pic](https://a.io/p.png)');
});

test('subtitle that repeats the title is dropped', () => {
  assert.equal(guideSubtitle('Bear Hunt Guide', 'Bear Hunt Guide'), '');
  assert.equal(guideSubtitle('Bear Hunt Guide', 'bear hunt guide.'), '');
  assert.equal(guideSubtitle('Bear Hunt', 'Bear Hunt guide'), '');
  assert.equal(guideSubtitle('Bear Hunt', 'How to rally the bear efficiently'), 'How to rally the bear efficiently');
  assert.equal(guideSubtitle('X', ''), '');
});

test('meta uses the real updated_at (falling back to created_at) and hides empty reviewer', () => {
  const guide = { body: words(10), updated_at: '2026-09-20T23:30:00Z', created_at: '2026-01-02T00:00:00Z' };
  assert.equal(guideMeta(guide).updatedLabel, 'Sep 20, 2026');
  assert.equal(guideMeta({ ...guide, updated_at: null }).updatedLabel, 'Jan 2, 2026');
  assert.equal(guideMeta({ body: 'x' }).updatedLabel, '');
  assert.equal(guideMeta(guide).reviewedBy, '');
  assert.equal(guideMeta({ ...guide, reviewed_by: '  Rhea ' }).reviewedBy, 'Rhea');
  assert.equal(formatGuideDate(null), '');
});

test('reviewed_by is optional, trimmed and length-limited', () => {
  const base = { slug: 'a', title: 'T', category: 'C', body: 'b', position: 1 };
  assert.equal(validateGuide(base).guide.reviewed_by, '');
  assert.equal(validateGuide({ ...base, reviewed_by: '  Rhea   K  ' }).guide.reviewed_by, 'Rhea K');
  assert.match(validateGuide({ ...base, reviewed_by: 'x'.repeat(81) }).error, /80 characters/);
});
