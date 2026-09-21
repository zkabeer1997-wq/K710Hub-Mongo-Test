// Pin a fixed, DST-free timezone (UTC-5) BEFORE importing the module so the
// local-conversion assertions are deterministic. Node re-reads process.env.TZ
// on the next Date operation, so this governs every conversion below.
process.env.TZ = 'Etc/GMT+5';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { utcHmToLocal, bearTimeLabel } from '../lib/localTime.js';

test('utcHmToLocal converts a UTC HH:MM to local (UTC-5)', () => {
  // 12:00 UTC is 07:00 in Etc/GMT+5. Assert the numeric part, not AM/PM,
  // so the test survives locale differences in the runner.
  const local = utcHmToLocal('12:00');
  assert.match(local, /07:00/);
});

test('utcHmToLocal accepts single-digit hours', () => {
  // 09:30 UTC -> 04:30 local.
  assert.match(utcHmToLocal('9:30'), /04:30/);
});

test('utcHmToLocal rejects malformed input', () => {
  for (const bad of ['25:00', '12:60', '1200', '', 'noon', null, undefined, 12]) {
    assert.equal(utcHmToLocal(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('bearTimeLabel is local-first with UTC in parentheses once mounted', () => {
  const label = bearTimeLabel('12:00', { mounted: true });
  assert.match(label, /07:00/);
  assert.match(label, /\(12:00 UTC\)$/);
});

test('bearTimeLabel falls back to plain UTC before mount', () => {
  assert.equal(bearTimeLabel('12:00', { mounted: false }), '12:00 UTC');
});

test('bearTimeLabel falls back to plain UTC for unparseable times', () => {
  assert.equal(bearTimeLabel('later', { mounted: true }), 'later UTC');
});
