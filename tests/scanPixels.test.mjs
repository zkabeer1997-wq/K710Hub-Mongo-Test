import assert from 'node:assert/strict';
import test from 'node:test';
import { resizeToWidth, resizeTo, toGrey, crop, scaleUp } from '../lib/scan/normalize.mjs';
import { otsuThreshold, binarize, prepareForOcr } from '../lib/scan/otsu.mjs';

function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const [r, g, b, a = 255] = fn(x, y);
    data.set([r, g, b, a], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
const same = (a, b) => a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;

test('resize is deterministic, returns new objects, keeps flat colour', () => {
  const p = img(40, 20, () => [10, 200, 90]);
  const a = resizeToWidth(p, 10); const b = resizeToWidth(p, 10);
  assert.ok(same(a, b)); assert.notEqual(a, p);
  assert.equal(a.width, 10); assert.equal(a.height, 5);
  assert.deepEqual([...a.data.slice(0, 4)], [10, 200, 90, 255]);
  const up = resizeToWidth(p, 80);
  assert.equal(up.height, 40); assert.deepEqual([...up.data.slice(0, 4)], [10, 200, 90, 255]);
});

test('area average halves a checker exactly', () => {
  const p = img(2, 2, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
  const r = resizeTo(p, 1, 1);
  assert.equal(r.data[0], 128);
});

test('degenerate sizes throw', () => {
  const p = img(4, 4, () => [0, 0, 0]);
  assert.throws(() => resizeToWidth(p, 0), RangeError);
  assert.throws(() => resizeToWidth({ width: 0, height: 0, data: new Uint8Array(0) }, 4), RangeError);
  assert.throws(() => scaleUp(p, 0.5), RangeError);
  assert.throws(() => scaleUp(p, NaN), RangeError);
  assert.throws(() => crop(p, { x: 10, y: 10, w: 2, h: 2 }), RangeError);
  assert.throws(() => crop(p, { x: 0, y: 0, w: NaN, h: 2 }), RangeError);
  assert.equal(resizeToWidth(img(1000, 1, () => [1, 1, 1]), 1).height, 1);
});

test('crop clamps and copies', () => {
  const p = img(4, 4, (x, y) => [x * 10, y * 10, 0]);
  const c = crop(p, { x: 2, y: 1, w: 10, h: 2 });
  assert.equal(c.width, 2); assert.equal(c.height, 2);
  assert.deepEqual([...c.data.slice(0, 3)], [20, 10, 0]);
  c.data[0] = 99; assert.equal(p.data[(1 * 4 + 2) * 4], 20);
});

test('scaleUp bilinear and toGrey', () => {
  const p = img(2, 1, (x) => (x ? [255, 255, 255] : [0, 0, 0]));
  const s = scaleUp(p, 2);
  assert.equal(s.width, 4);
  assert.equal(s.data[0], 0); assert.equal(s.data[12], 255);
  assert.ok(s.data[4] > 0 && s.data[4] < 128);
  assert.ok(same(scaleUp(p, 2), s));
  const g = toGrey(img(1, 1, () => [255, 0, 0, 77]));
  assert.deepEqual([...g.data], [76, 76, 76, 77]);
});

// Bimodal: 30% dark text (30) on 70% light (220)
const textOnLight = img(10, 10, (x) => (x < 3 ? [30, 30, 30] : [220, 220, 220]));
const lightOnDark = img(10, 10, (x) => (x < 3 ? [220, 220, 220] : [30, 30, 30]));

test('otsu threshold separates modes', () => {
  const t = otsuThreshold(textOnLight);
  assert.ok(t >= 30 && t < 220, `t=${t}`);
  assert.equal(otsuThreshold(textOnLight), otsuThreshold(textOnLight));
});

test('binarize: dark text stays, light text on dark inverts, both give dark glyphs', () => {
  const a = binarize(textOnLight); const b = binarize(lightOnDark);
  assert.equal(a.inverted, false); assert.equal(b.inverted, true);
  assert.ok(same(a.pixels, b.pixels));
  assert.equal(a.pixels.data[0], 0); assert.equal(a.pixels.data[9 * 4], 255);
  assert.equal(binarize(lightOnDark, { invertAuto: false }).inverted, false);
});

test('prepareForOcr scales 3x, binary output, deterministic', () => {
  const out = prepareForOcr(lightOnDark, { scale: 3 });
  assert.equal(out.width, 30); assert.equal(out.height, 30);
  assert.ok([...out.data].every((v, i) => (i % 4 === 3 ? v === 255 : v === 0 || v === 255)));
  assert.ok(same(out, prepareForOcr(lightOnDark)));
});
