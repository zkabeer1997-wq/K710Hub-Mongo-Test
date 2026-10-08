import assert from 'node:assert/strict';
import test from 'node:test';
import { rgbToHsv, hsvDistance, averageColor, nearestPalette } from '../lib/scan/color.mjs';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test('rgbToHsv known values', () => {
  const red = rgbToHsv(255, 0, 0); near(red.h, 0); near(red.s, 1); near(red.v, 1);
  near(rgbToHsv(0, 255, 0).h, 120); near(rgbToHsv(0, 0, 255).h, 240);
  near(rgbToHsv(255, 255, 0).h, 60); near(rgbToHsv(255, 0, 255).h, 300);
  const grey = rgbToHsv(128, 128, 128); near(grey.s, 0); near(grey.v, 128 / 255);
  assert.deepEqual(rgbToHsv(0, 0, 0), { h: 0, s: 0, v: 0 });
  near(rgbToHsv(255, 0, 1).h, 359.76470588, 1e-4);
});

test('hue distance is circular', () => {
  const a = { h: 350, s: 1, v: 1 };
  assert.ok(hsvDistance(a, { h: 10, s: 1, v: 1 }) < hsvDistance(a, { h: 100, s: 1, v: 1 }));
  near(hsvDistance(a, { h: 10, s: 1, v: 1 }), hsvDistance({ h: 0, s: 1, v: 1 }, { h: 20, s: 1, v: 1 }));
  near(hsvDistance(a, a), 0);
  near(hsvDistance(a, { h: 5, s: 0.5, v: 0.9 }), hsvDistance({ h: 5, s: 0.5, v: 0.9 }, a));
  assert.ok(hsvDistance({ h: 0, s: 1, v: 1 }, { h: 180, s: 0, v: 0 }) <= 1);
});

function solid(w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}

test('averageColor trims outliers and ignores transparent', () => {
  const p = solid(10, 10, [100, 150, 200, 255]);
  p.data.set([255, 255, 255, 255], 0); // outlier
  p.data.set([0, 0, 0, 0], 4); // transparent
  const c = averageColor(p, { x: 0, y: 0, w: 10, h: 10 }, { trim: 0.1 });
  assert.equal(c.count, 99);
  near(c.r, 100); near(c.g, 150); near(c.b, 200);
  assert.equal(averageColor(solid(2, 2, [1, 2, 3, 0]), { x: 0, y: 0, w: 2, h: 2 }), null);
  assert.equal(averageColor(p, { x: 50, y: 50, w: 2, h: 2 }), null);
});

const palette = [
  { id: 'a', hsv: { h: 120, s: 0.8, v: 0.8 }, tolerance: 0.3 },
  { id: 'b', hsv: { h: 220, s: 0.8, v: 0.8 }, tolerance: 0.3 },
  { id: 'c', hsv: { h: 30, s: 0.9, v: 0.9 }, tolerance: 0.3 },
];

test('nearestPalette picks closest with high confidence for exact match', () => {
  const r = nearestPalette({ h: 120, s: 0.8, v: 0.8 }, palette);
  assert.equal(r.best, 'a'); assert.equal(r.confidence, 1); assert.equal(r.distance, 0);
  assert.equal(r.alternatives.length, 2);
  assert.deepEqual(nearestPalette({ h: 1, s: 1, v: 1 }, []), { best: null, second: null, distance: Infinity, confidence: 0, alternatives: [] });
});

test('confidence is monotone in distance and low when ambiguous', () => {
  let prev = 2;
  for (let dh = 0; dh <= 60; dh += 5) {
    const c = nearestPalette({ h: 120 + dh, s: 0.8, v: 0.8 }, palette.slice(0, 1)).confidence;
    assert.ok(c <= prev + 1e-12, `dh=${dh}`);
    prev = c;
  }
  assert.equal(nearestPalette({ h: 240, s: 0.8, v: 0.8 }, palette.slice(0, 1)).confidence, 0);
  const two = [{ id: 'x', hsv: { h: 100, s: 0.8, v: 0.8 }, tolerance: 0.5 }, { id: 'y', hsv: { h: 140, s: 0.8, v: 0.8 }, tolerance: 0.5 }];
  const mid = nearestPalette({ h: 120, s: 0.8, v: 0.8 }, two);
  const clear = nearestPalette({ h: 100, s: 0.8, v: 0.8 }, two);
  assert.ok(mid.confidence < 0.3, `mid=${mid.confidence}`);
  assert.ok(clear.confidence > mid.confidence);
  for (const r of [mid, clear]) assert.ok(r.confidence >= 0 && r.confidence <= 1);
});
