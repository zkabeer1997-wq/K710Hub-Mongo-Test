import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canEditInPlace, editorHtmlToMarkdown, htmlToMarkdown, markdownToEditorHtml, normalizeLinkAddress, plainTextToEditorHtml,
} from '../lib/guideRichText.mjs';
import {
  createBlock, parseVideoUrl, sanitizeBlock, validateLayout, emptyLayout, videoEmbedSrc, videoLinkUrl, blockToMarkdown,
} from '../lib/guideLayout.mjs';

test('markdown round-trips through the in-place editor', () => {
  for (const md of ['Hello **bold** and *it* [x](https://a.com)', '- a\n- b\n\n1. one\n2. two', '## Head\n\nPara line1\\\nline2', 'snake_case and a\\*b']) {
    assert.equal(editorHtmlToMarkdown(markdownToEditorHtml(md)), md);
  }
});

test('malicious pasted html is neutralised', () => {
  const evil = '<p onclick="x()">hi<img src=x onerror=alert(1)><script>alert(2)</script></p><a href="javascript:alert(3)">bad</a><iframe src=//e></iframe><style>p{}</style><a href="https://ok.com" onclick=x>good</a>';
  const md = htmlToMarkdown(evil);
  assert.ok(!/<|onerror|onclick|javascript|alert/.test(md), md);
  assert.match(md, /\[good\]\(https:\/\/ok\.com\)/);
  assert.match(md, /bad/);
  assert.equal(htmlToMarkdown('<b>&lt;script&gt;x&lt;/script&gt;</b>').includes('<script'), false);
  assert.ok(!/<script/i.test(markdownToEditorHtml('<script>alert(1)</script> [x](javascript:alert(1))')));
  assert.ok(!/href="javascript/i.test(markdownToEditorHtml('[x](javascript:alert(1))')));
  assert.ok(!/<b|<i/.test(plainTextToEditorHtml('<b>x</b>')));
});

test('advanced markdown keeps the plain editor; link addresses are normalised', () => {
  assert.equal(canEditInPlace('Plain **text**'), true);
  assert.equal(canEditInPlace('| a | b |\n|---|---|'), false);
  assert.equal(canEditInPlace('> quote'), false);
  assert.equal(normalizeLinkAddress('example.com/x'), 'https://example.com/x');
  assert.equal(normalizeLinkAddress('javascript:alert(1)'), '');
  assert.equal(normalizeLinkAddress('me@x.com'), 'mailto:me@x.com');
});

test('video blocks accept only YouTube and Google Drive and store provider + id', () => {
  assert.deepEqual(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVideoUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing'), { provider: 'drive', id: '1AbCdEfGhIjKlMnOpQr' });
  assert.deepEqual(parseVideoUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQr'), { provider: 'drive', id: '1AbCdEfGhIjKlMnOpQr' });
  for (const bad of ['https://vimeo.com/1', 'https://evil.drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view', 'https://drive.google.com.evil.io/file/d/1AbCdEfGhIjKlMnOpQr/view', 'http://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view', 'javascript:alert(1)']) {
    assert.ok(parseVideoUrl(bad).error, bad);
  }
  const base = emptyLayout('article');
  const withBlock = b => ({ ...base, areas: { header: [], main: [b] } });
  const v = { ...createBlock('video'), provider: 'drive', videoId: '1AbCdEfGhIjKlMnOpQr', title: 'T', url: 'https://evil.example' };
  const out = validateLayout(withBlock(v)).layout.areas.main[0];
  assert.equal(out.provider, 'drive');
  assert.equal(out.videoId, '1AbCdEfGhIjKlMnOpQr');
  assert.ok(!('url' in out));
  assert.match(validateLayout(withBlock({ ...v, provider: 'vimeo' })).error, /not supported/);
  assert.match(validateLayout(withBlock({ ...v, videoId: '../x' })).error, /not supported/);
  assert.equal(sanitizeBlock({ type: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' }).block.provider, 'youtube');
  assert.equal(videoEmbedSrc(out), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/preview');
  assert.equal(videoEmbedSrc({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' }), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
  assert.equal(videoEmbedSrc({ provider: 'youtube', videoId: 'x' }), '');
  assert.equal(videoLinkUrl(out), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view');
  assert.match(blockToMarkdown(out), /^\[T\]\(https:\/\/drive/);
});
