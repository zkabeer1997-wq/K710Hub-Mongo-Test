import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesMatchImageType, sniffImageType } from '../lib/interestUploadLimits.mjs';
import { decodeImageDataUrl } from '../lib/imageDataUrl.mjs';

const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = pad(Buffer.from('GIF89a'));
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);

test('sniffImageType recognises the four formats and rejects the rest', () => {
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(GIF), 'image/gif');
  assert.equal(sniffImageType(WEBP), 'image/webp');
  assert.equal(sniffImageType(pad(Buffer.from('<svg xmlns='))), null);
  assert.equal(sniffImageType(pad(Buffer.from('<?php echo 1;'))), null);
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8])), null);
  assert.equal(sniffImageType(null), null);
});

test('declared type must match the real bytes', () => {
  assert.equal(bytesMatchImageType(PNG, 'image/png'), true);
  assert.equal(bytesMatchImageType(PNG, 'image/jpeg'), false);
  assert.equal(bytesMatchImageType(pad(Buffer.from('<html>')), 'image/png'), false);
});

test('decodeImageDataUrl only serves data URLs whose bytes match their label', () => {
  const url = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
  assert.equal(decodeImageDataUrl(url('image/png', PNG)).type, 'image/png');
  assert.equal(decodeImageDataUrl(url('image/png', JPEG)), null);
  assert.equal(decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), null);
  assert.equal(decodeImageDataUrl('https://example.com/a.png'), null);
  assert.equal(decodeImageDataUrl(undefined), null);
});
