import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { checkImageBytes, MAX_IMAGE_BYTES, STANDARD_WIDTH } from '../lib/scan/imageCheck.mjs';

const png = () => new Uint8Array(PNG.sync.write(new PNG({ width: 4, height: 4 })));
const jpeg = (extra = []) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 1, 2, 3, ...extra, 0xff, 0xd9]);

test('constants', () => {
  assert.equal(MAX_IMAGE_BYTES, 12 * 1024 * 1024);
  assert.equal(STANDARD_WIDTH, 1080);
});

test('valid png accepted', () => {
  const r = checkImageBytes(png());
  assert.equal(r.ok, true); assert.equal(r.format, 'png'); assert.equal(r.complete, true); assert.equal(r.action, 'accept');
});

test('truncated png asks to redraw', () => {
  const b = png();
  for (const cut of [b.length - 1, b.length - 12, Math.floor(b.length / 2)]) {
    const r = checkImageBytes(b.slice(0, cut));
    assert.equal(r.complete, false); assert.equal(r.action, 'redraw'); assert.ok(r.reasons.length > 0);
  }
});

test('png with trailing bytes is not accepted silently', () => {
  const b = png();
  const r = checkImageBytes(Uint8Array.from([...b, 0, 0]));
  assert.equal(r.action, 'redraw');
});

test('wrong signature is unknown and rejected', () => {
  const b = png(); b[1] = 0x00;
  const r = checkImageBytes(b);
  assert.equal(r.format, 'unknown'); assert.equal(r.action, 'reject');
});

test('zero bytes and oversize are rejected', () => {
  assert.equal(checkImageBytes(new Uint8Array(0)).action, 'reject');
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1); big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const r = checkImageBytes(big);
  assert.equal(r.action, 'reject'); assert.match(r.reasons[0], /larger/);
  assert.equal(checkImageBytes(png(), { maxBytes: 10 }).action, 'reject');
});

test('jpeg: complete, zero padding tolerated, missing EOI redraw', () => {
  assert.equal(checkImageBytes(jpeg()).action, 'accept');
  assert.equal(checkImageBytes(Uint8Array.from([...jpeg(), 0, 0, 0])).action, 'accept');
  const noEoi = jpeg().slice(0, -2);
  const r = checkImageBytes(noEoi);
  assert.equal(r.format, 'jpeg'); assert.equal(r.complete, false); assert.equal(r.action, 'redraw');
});

test('progressive jpeg asks to redraw', () => {
  const prog = Uint8Array.from([0xff, 0xd8, 0xff, 0xc2, 0x00, 0x04, 0, 0, 0xff, 0xda, 0x00, 0x02, 1, 0xff, 0xd9]);
  const r = checkImageBytes(prog);
  assert.equal(r.complete, true); assert.equal(r.action, 'redraw');
});

function webp(size, declared) {
  const b = new Uint8Array(size);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  const d = declared ?? size - 8;
  b[4] = d & 255; b[5] = (d >> 8) & 255; b[6] = (d >> 16) & 255; b[7] = (d >>> 24) & 255;
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  return b;
}

test('webp size field must match', () => {
  assert.equal(checkImageBytes(webp(40)).action, 'accept');
  assert.equal(checkImageBytes(webp(40, 100)).action, 'redraw');
  assert.equal(checkImageBytes(webp(40, 10)).action, 'redraw');
});

test('heic needs conversion', () => {
  const b = new Uint8Array(32);
  b.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
  const r = checkImageBytes(b);
  assert.equal(r.format, 'heic'); assert.equal(r.action, 'redraw');
});
