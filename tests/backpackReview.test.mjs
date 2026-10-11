import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { runScan, ENGINE_VERSION } from '../lib/scan/engine.mjs';
import { buildBackpackReview, evaluateBackpack, backpackSnapshot, backpackCorrections } from '../lib/scan/backpackReview.mjs';
import {
  sanitizeBackpackScan, sanitizeFieldSources, formatDays, displayDays, scanDifference, PREP_SCAN_FIELDS, MAX_BACKPACK_MINUTES,
} from '../lib/backpackScan.mjs';
import { sanitizeScanCorrections } from '../lib/backpackScan.server.mjs';
import { validateNobleAdvisor } from '../lib/nobleAdvisor.mjs';

const DIR = path.resolve(import.meta.dirname, 'fixtures/scan/backpack-inventory');
async function scan(file) {
  const { data, info } = await sharp(path.join(DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return runScan('backpack_inventory', { width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
}
const resources = await scan('resources.png');
const speedups = await scan('speedups.png');
const both = buildBackpackReview([{ index: 0, result: resources }, { index: 1, result: speedups }]);

test('both screenshots, any order: ground-truth numbers and nothing left to check; healing (green plus) is ignored', () => {
  const swapped = buildBackpackReview([{ index: 0, result: speedups }, { index: 1, result: resources }]);
  for (const review of [both, swapped]) {
    assert.equal(review.ok, true);
    assert.deepEqual(review.tabs.slice().sort(), ['resources', 'speedups']);
    assert.equal(review.summary.toCheck, 0);
    assert.equal(review.speedupRows.length, 11);
    const ev = evaluateBackpack(review, {});
    assert.equal(ev.ok, true);
    assert.deepEqual(ev.resources, { tg: 8018, ttg: 280, tg_dust: 11 });
    assert.deepEqual(ev.minutes, { construction: 11031 + 5 * 6808 + 60 * 542, research: 145 + 5 * 94 + 60 * 20, troop: 3593, general: 2500 });
  }
});

test('days (owner rule): troop = troop only (2.50); research = research + general; nothing is added for healing', () => {
  const ev = evaluateBackpack(both, {});
  assert.equal(formatDays(ev.days.troop), '2.5');
  assert.equal(displayDays(ev.days.troop), '2.5');
  assert.equal(ev.days.troop, 3593 / 1440);
  assert.equal(ev.days.research, (145 + 470 + 1200 + 2500) / 1440);
  assert.equal(formatDays(ev.days.research), '3');
  assert.equal(ev.days.general, 2500 / 1440);
  assert.equal(Object.hasOwn(ev.minutes, 'other'), false);
});

test('only one tab scanned: only what was read is available, the rest stays null', () => {
  const onlyRes = evaluateBackpack(buildBackpackReview([{ index: 0, result: resources }]), {});
  assert.equal(onlyRes.minutes, null);
  assert.equal(onlyRes.days, null);
  assert.equal(onlyRes.resources.tg, 8018);
  const onlySpd = evaluateBackpack(buildBackpackReview([{ index: 0, result: speedups }]), {});
  assert.deepEqual(onlySpd.resources, { tg: null, ttg: null, tg_dust: null });
  assert.equal(formatDays(onlySpd.days.troop), '2.5');
});

test('the same image twice is counted once', () => {
  const twice = buildBackpackReview([{ index: 0, result: speedups }, { index: 1, result: speedups }]);
  assert.equal(twice.speedupRows.length, 11);
  assert.match(twice.notes[0], /same screenshot/);
  assert.equal(evaluateBackpack(twice, {}).minutes.troop, 3593);
  const resTwice = buildBackpackReview([{ index: 0, result: resources }, { index: 1, result: resources }]);
  assert.equal(evaluateBackpack(resTwice, {}).resources.ttg, 280);
});

test('a failed scan gives a friendly message and no rows', () => {
  const r = buildBackpackReview([{ index: 0, result: { status: 'failed', reasons: ['This does not look like Backpack > Resources or Backpack > Speedups.'] } }]);
  assert.equal(r.ok, false);
  assert.match(r.message, /Backpack/);
  assert.equal(r.resourceRows, null);
});

test('a low-confidence row blocks Use until it is corrected or confirmed; edits change the numbers and are recorded', () => {
  const clone = structuredClone(speedups);
  clone.speedups[5].quantity.confidence = 0.4; // troop 1 min x373
  const review = buildBackpackReview([{ index: 0, result: clone }]);
  const row = review.speedupRows.find((r) => r.readQuantity === 373);
  assert.equal(row.needsCheck, true);
  assert.deepEqual(evaluateBackpack(review, {}).pending, [row.id]);
  assert.equal(evaluateBackpack(review, { confirmed: { [row.id]: true } }).ok, true);
  const edited = evaluateBackpack(review, { edits: { [row.id]: { quantity: 400 } } });
  assert.equal(edited.ok, true);
  assert.equal(edited.minutes.troop, 3593 + 27);
  const c = backpackCorrections(review, { edits: { [row.id]: { quantity: 400 } } });
  assert.deepEqual(c, [{ slot: 'speedup.troop.1m', field: 'quantity', read_value: 373, read_confidence: 0.4, corrected_value: 400 }]);
  assert.equal(sanitizeScanCorrections(c).length, 1);
  // removed and added rows
  const rm = evaluateBackpack(review, { confirmed: { [row.id]: true }, removed: { [row.id]: true } });
  assert.equal(rm.minutes.troop, 3593 - 373);
  const add = evaluateBackpack(review, { confirmed: { [row.id]: true }, added: [{ id: 'add:1', category: 'troop', denomination: '1h', quantity: 2 }] });
  assert.equal(add.minutes.troop, 3593 + 120);
  assert.equal(evaluateBackpack(review, { confirmed: { [row.id]: true }, added: [{ id: 'add:1', category: 'troop', denomination: '', quantity: 2 }] }).ok, false);
});

test('snapshot: structured numbers only, round-trips the server check', () => {
  const ev = evaluateBackpack(both, {});
  const snap = backpackSnapshot(ev, { engineVersion: ENGINE_VERSION, now: new Date('2026-10-10T12:00:00Z') });
  assert.deepEqual(Object.keys(snap).sort(), ['engine_version', 'scanned_at', 'speedup_minutes', 'tg', 'tg_dust', 'ttg']);
  assert.deepEqual(Object.keys(snap.speedup_minutes), ['construction', 'research', 'troop', 'general']);
  const ok = sanitizeBackpackScan(snap, new Date('2026-10-10T13:00:00Z'));
  assert.ok(ok.snapshot);
  assert.equal(ok.snapshot.tg, 8018);
  assert.equal(ok.snapshot.speedup_minutes.troop, 3593);
  assert.ok(ok.snapshot.scanned_at instanceof Date);
});

test('server check: finite, non-negative, bounded; nothing sent means nothing stored', () => {
  const good = { scanned_at: new Date().toISOString(), engine_version: '0.3.0', tg: 1, ttg: null, tg_dust: 0, speedup_minutes: { construction: 0, research: 5, troop: 7, general: null } };
  assert.ok(sanitizeBackpackScan(good).snapshot);
  assert.equal(sanitizeBackpackScan(undefined).snapshot, null);
  for (const bad of [
    { ...good, tg: -1 }, { ...good, tg: 1.5 }, { ...good, tg: Infinity }, { ...good, tg: 'x' }, { ...good, ttg: 1e12 },
    { ...good, speedup_minutes: { ...good.speedup_minutes, troop: MAX_BACKPACK_MINUTES + 1 } }, { ...good, speedup_minutes: null },
{ ...good, scanned_at: 'yesterday' }, { ...good, scanned_at: new Date(Date.now() + 3600e3).toISOString() }, 'text', [],
  ]) assert.ok(sanitizeBackpackScan(bad).error, JSON.stringify(bad).slice(0, 60));
  assert.deepEqual(sanitizeFieldSources({ ttg_used: 'scan', tg_used: 'typed', tg_dust: 'bogus', evil: 'scan' }, PREP_SCAN_FIELDS), { ttg_used: 'scan', tg_used: 'typed' });
});

test('noble validator: snapshot accepted only when valid; typed rules unchanged', () => {
  const booking = { in_game_name: 'Aria', want_troop_training: 'Yes', is_transfer: 'No', promoting_t11: 'No', troop_speedup_days: '4.23', avail_day4: ['00:30'] };
  assert.equal(validateNobleAdvisor(booking).record.backpack_scan, undefined);
  const snap = { scanned_at: new Date().toISOString(), engine_version: '0.3.0', tg: null, ttg: null, tg_dust: null, speedup_minutes: { construction: null, research: null, troop: 3593, general: 2500 } };
  const r = validateNobleAdvisor({ ...booking, backpack_scan: snap, backpack_sources: { troop_speedup_days: 'scan', ttg_used: 'scan' } });
  assert.equal(r.record.backpack_scan.speedup_minutes.troop, 3593);
  assert.deepEqual(r.record.backpack_sources, { troop_speedup_days: 'scan' });
  assert.ok(validateNobleAdvisor({ ...booking, backpack_scan: { ...snap, tg: -5 } }).error);
  assert.ok(validateNobleAdvisor({ ...booking, troop_speedup_days: '100001' }).error);
  assert.ok(validateNobleAdvisor({ ...booking, troop_speedup_days: '-1' }).error);
});

test('admin hint: typed vs scanned differ by more than 10 percent', () => {
  const snap = { tg: 8018, ttg: 280, tg_dust: 11, speedup_minutes: { construction: 0, research: 1815, troop: 3593, general: 2500 } };
  assert.equal(scanDifference('ttg_used', '280', snap), null);
  assert.equal(scanDifference('ttg_used', '260', snap), null); // 7%
  assert.ok(scanDifference('ttg_used', '100', snap));
  assert.equal(scanDifference('troop_speedup_days', '2.5', snap), null);
  assert.ok(scanDifference('troop_speedup_days', '4.2', snap));
  assert.equal(scanDifference('research_speedup_days', '3', snap), null); // (1815 + 2500) / 1440 = 3.0
  assert.equal(scanDifference('troop_speedup_days', '', snap), null);
  assert.equal(scanDifference('tg_dust', '11', { ...snap, tg_dust: null }), null);
  assert.equal(scanDifference('notes', '5', snap), null);
});
