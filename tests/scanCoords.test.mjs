import assert from 'node:assert/strict';
import test from 'node:test';
import { frameFromAnchor, normToPx, pxToNorm, clampRect, rectsOverlap, iou } from '../lib/scan/coords.mjs';

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const closeRect = (a, b, eps) => { for (const k of ['x', 'y', 'w', 'h']) close(a[k], b[k], eps); };

const expected = { x: 0.1, y: 0.05, w: 0.5, h: 0.1 };

test('identity frame when anchor is where the profile expects it', () => {
  const size = { width: 1000, height: 2000 };
  const f = frameFromAnchor({ x: 100, y: 100, w: 500, h: 200 }, expected, size);
  closeRect(normToPx(expected, f, size, { clamp: false, round: false }), { x: 100, y: 100, w: 500, h: 200 });
  close(f.scale, 1000); close(f.aspect, 2);
});

test('aspect invariance: taller phone, same anchor size, regions keep position relative to the anchor', () => {
  const region = { x: 0.2, y: 0.3, w: 0.1, h: 0.05 };
  const a = { x: 50, y: 40, w: 300, h: 60 };
  const fA = frameFromAnchor(a, expected, { width: 600, height: 1200 });
  const fB = frameFromAnchor(a, expected, { width: 600, height: 1500 });
  const pa = normToPx(region, fA, { width: 600, height: 1200 }, { clamp: false, round: false });
  const pb = normToPx(region, fB, { width: 600, height: 1500 }, { clamp: false, round: false });
  closeRect(pa, pb);
  // region measured in anchor widths/heights from the anchor's own corner
  close((pa.x - a.x) / a.w, (region.x - expected.x) / expected.w);
  close((pa.y - a.y) / a.h, (region.y - expected.y) / expected.h);
});

test('different anchor size scales regions', () => {
  const size = { width: 2000, height: 4000 };
  const f = frameFromAnchor({ x: 200, y: 200, w: 1000, h: 400 }, expected, size);
  const r = normToPx({ x: 0.1, y: 0.05, w: 0.25, h: 0.05 }, f, size, { clamp: false, round: false });
  closeRect(r, { x: 200, y: 200, w: 500, h: 200 });
});

test('random round-trips (seeded)', () => {
  const rnd = prng(710);
  for (let i = 0; i < 500; i += 1) {
    const exp = { x: rnd() * 0.5, y: rnd() * 0.5, w: 0.05 + rnd() * 0.4, h: 0.02 + rnd() * 0.3 };
    const det = { x: rnd() * 500, y: rnd() * 800, w: 20 + rnd() * 600, h: 10 + rnd() * 400 };
    const size = { width: 400 + rnd() * 2000, height: 600 + rnd() * 3000 };
    const f = frameFromAnchor(det, exp, size);
    const r = { x: rnd(), y: rnd(), w: 0.01 + rnd() * 0.3, h: 0.01 + rnd() * 0.3 };
    closeRect(pxToNorm(normToPx(r, f, size, { clamp: false, round: false }), f), r, 1e-9);
    const px = { x: rnd() * 1000, y: rnd() * 1000, w: 1 + rnd() * 100, h: 1 + rnd() * 100 };
    closeRect(normToPx(pxToNorm(px, f), f, size, { clamp: false, round: false }), px, 1e-6);
    closeRect(normToPx(exp, f, size, { clamp: false, round: false }), det, 1e-6);
  }
});

test('rounding goes outward and clamp stays in the image', () => {
  const size = { width: 100, height: 100 };
  const f = { x0: 0, y0: 0, scale: 100, aspect: 1 };
  const r = normToPx({ x: 0.105, y: 0.105, w: 0.2, h: 0.2 }, f, size);
  assert.deepEqual(r, { x: 10, y: 10, w: 21, h: 21 });
  const c = normToPx({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, f, size);
  assert.deepEqual(c, { x: 90, y: 90, w: 10, h: 10 });
});

test('clampRect, overlap, iou', () => {
  assert.deepEqual(clampRect({ x: -0.1, y: 0.5, w: 0.5, h: 0.8 }), { x: 0, y: 0.5, w: 0.4, h: 0.5 });
  assert.equal(clampRect({ x: 2, y: 2, w: 1, h: 1 }).w, 0);
  const a = { x: 0, y: 0, w: 2, h: 2 };
  assert.equal(rectsOverlap(a, { x: 1, y: 1, w: 2, h: 2 }), true);
  assert.equal(rectsOverlap(a, { x: 2, y: 0, w: 1, h: 1 }), false);
  close(iou(a, a), 1); close(iou(a, { x: 1, y: 0, w: 2, h: 2 }), 1 / 3); close(iou(a, { x: 5, y: 5, w: 1, h: 1 }), 0);
});

test('degenerate inputs throw', () => {
  const size = { width: 10, height: 10 };
  assert.throws(() => frameFromAnchor({ x: 0, y: 0, w: 0, h: 5 }, expected, size), RangeError);
  assert.throws(() => frameFromAnchor({ x: 0, y: 0, w: 5, h: 5 }, { ...expected, w: 0 }, size), RangeError);
  assert.throws(() => frameFromAnchor({ x: 0, y: 0, w: 5, h: 5 }, expected, { width: 0, height: 5 }), RangeError);
  assert.throws(() => clampRect({ x: NaN, y: 0, w: 1, h: 1 }), RangeError);
});
