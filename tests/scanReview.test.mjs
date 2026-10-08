import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, buildReviewRows, pendingRows, scanFailureMessage } from '../lib/scan/review.mjs';
import { decodeImageFile, scaledSize, validateUpload, MAX_SCAN_WIDTH } from '../lib/scan/browser/decodeImage.mjs';
import { CHARM_SLOTS, GEAR_SLOTS } from '../lib/scan/kinds/governorProfile/gameData.mjs';

const f = (value, confidence = 0.95, extra = {}) => ({ value, confidence, flags: [], ...extra });

function result(overrides = {}) {
  return {
    kind: 'governor_profile', status: 'ok', reasons: [],
    gear: GEAR_SLOTS.map((slot) => ({ slot, quality: f('gold'), tier: f(3), stars: f(2) })),
    charms: CHARM_SLOTS.map((slot) => ({ slot, level: f(12) })),
    ...overrides,
  };
}

test('all confident: 24 rows, nothing to check, summary line', () => {
  const r = buildReviewRows(result());
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 24);
  assert.equal(r.summary.text, '24 of 24 read confidently, 0 to check');
  assert.equal(r.rows[0].readValue, 'Gold T3 ★★');
  assert.equal(r.rows.find((x) => x.slot === 'cavalry_1' && x.kind === 'charm').readValue, 'Level 12');
  assert.equal(r.rows.find((x) => x.slot === 'hat').boardKey, 'cavalry_1');
});

test('low confidence, null and impossible values need a check; alternatives are offered', () => {
  const res = result();
  res.gear[0].quality = f('gold', 0.5, { alternatives: [{ value: 'purple', confidence: 0.4 }] });
  res.gear[1].stars = f(null, 0);
  res.gear[2].quality = f('green'); res.gear[2].tier = f(3); // green T3 does not exist
  res.charms[0].level = f(9, 0.6, { alternatives: [{ value: 10, confidence: 0.3 }, { value: 9, confidence: 0.2 }] });
  res.charms[1] = { slot: res.charms[1].slot, level: f(null, 0) };
  const r = buildReviewRows(res);
  assert.equal(r.summary.toCheck, 5);
  assert.equal(r.summary.text, '19 of 24 read confidently, 5 to check');
  const hat = r.rows.find((x) => x.slot === 'hat');
  assert.equal(hat.needsCheck, true);
  assert.deepEqual(hat.alternatives, []); // purple T3 does not exist, so it is not offered
  const charm0 = r.rows.find((x) => x.id === `charm:${res.charms[0].slot}`);
  assert.deepEqual(charm0.alternatives, ['Level 10']);
  assert.equal(r.rows.find((x) => x.id === `charm:${res.charms[1].slot}`).readValue, '');
});

test('quality alternative becomes a full valid option when the combination exists', () => {
  const res = result();
  res.gear[0].quality = f('gold', 0.5, { alternatives: [{ value: 'red', confidence: 0.4 }] });
  const hat = buildReviewRows(res).rows.find((x) => x.slot === 'hat');
  assert.deepEqual(hat.alternatives, ['Red T3 ★★']);
});

test('missing entries and failed scans', () => {
  const r = buildReviewRows(result({ gear: [], charms: [] }));
  assert.equal(r.rows.length, 24);
  assert.equal(r.summary.toCheck, 24);
  const bad = buildReviewRows({ status: 'invalid_image', reasons: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.message, scanFailureMessage({ status: 'invalid_image' }));
});

test('apply is blocked until every flagged row is edited or confirmed', () => {
  const res = result();
  res.charms[0].level = f(9, 0.5);
  res.charms[1] = { slot: res.charms[1].slot, level: f(null, 0) };
  const { rows } = buildReviewRows(res);
  assert.equal(pendingRows(rows).length, 2);
  assert.equal(applyReview(rows).ok, false);
  const id0 = `charm:${res.charms[0].slot}`; const id1 = `charm:${res.charms[1].slot}`;
  assert.deepEqual(pendingRows(rows, { confirmed: { [id0]: true } }).map((x) => x.id), [id1]);
  const out = applyReview(rows, { confirmed: { [id0]: true }, edits: { [id1]: 'Level 4' } });
  assert.equal(out.ok, true);
  assert.equal(out.charms[res.charms[0].slot], 'Level 9');
  assert.equal(out.charms[res.charms[1].slot], 'Level 4');
  assert.equal(out.gear.cavalry_1, 'Gold T3 ★★');
  assert.equal(Object.keys(out.gear).length, 6);
  assert.equal(Object.keys(out.charms).length, 18);
});

test('corrections record only real changes, with the reader value and confidence', () => {
  const res = result();
  res.gear[0].quality = f('gold', 0.5);
  res.charms[0].level = f(9, 0.6);
  res.charms[1] = { slot: res.charms[1].slot, level: f(null, 0) };
  const { rows } = buildReviewRows(res);
  const id0 = `charm:${res.charms[0].slot}`; const id1 = `charm:${res.charms[1].slot}`;
  const out = applyReview(rows, { edits: { 'gear:hat': 'Purple T1 1 star', [id0]: 'Level 9', [id1]: 'Level 4' } });
  assert.deepEqual(out.corrections, [
    { slot: 'hat', field: 'quality', read_value: 'gold', read_confidence: 0.5, corrected_value: 'purple' },
    { slot: 'hat', field: 'tier', read_value: 3, read_confidence: 0.95, corrected_value: 1 },
    { slot: 'hat', field: 'stars', read_value: 2, read_confidence: 0.95, corrected_value: 1 },
    { slot: res.charms[1].slot, field: 'level', read_value: null, read_confidence: 0, corrected_value: 4 },
  ]);
  const cleared = applyReview(rows, { edits: { 'gear:hat': '' }, confirmed: { [id0]: true, [id1]: true } });
  assert.deepEqual(cleared.corrections.filter((c) => c.slot === 'hat'), [{ slot: 'hat', field: 'quality', read_value: 'gold', read_confidence: 0.5, corrected_value: null }]);
  assert.equal(cleared.gear.cavalry_1, '');
});

test('decode guards: sizes and byte validation', () => {
  assert.deepEqual(scaledSize(3000, 1500), { width: MAX_SCAN_WIDTH, height: 750 });
  assert.deepEqual(scaledSize(1000, 2000), { width: 1000, height: 2000 });
  assert.deepEqual(scaledSize(0, 5), { width: 0, height: 0 });
  assert.equal(validateUpload(new Uint8Array([1, 2, 3, 4])).ok, false);
  assert.match(validateUpload(new Uint8Array(0)).message, /empty/);
  assert.equal(validateUpload(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).ok, true);
});

test('decodeImageFile rejects a non-image with a friendly message and never needs a browser for that', async () => {
  const file = { arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  const out = await decodeImageFile(file);
  assert.equal(out.ok, false);
  assert.match(out.message, /Try a different screenshot/);
});
