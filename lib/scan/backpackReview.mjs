// Pure logic behind the Backpack scan review: ScanResult(s) -> rows the member confirms -> numbers for the form,
// the saved snapshot and the corrections. No DOM, no React: tested in tests/backpackReview.test.mjs.
import { REVIEW_THRESHOLD } from './review.mjs';
import { formatCount, formatDays } from '../backpackScan.mjs';
import {
  MINUTES_BY_DENOMINATION, MINUTES_PER_DAY, MAX_QUANTITY, RESOURCE_ITEMS, SPEEDUP_CATEGORIES, SPEEDUP_DENOMINATIONS,
  isCategory, isDenomination,
} from './kinds/backpackInventory/gameData.mjs';

export { REVIEW_THRESHOLD };
export const CATEGORY_IDS = SPEEDUP_CATEGORIES.map((c) => c.id).filter((id) => id !== 'healing');
const CATEGORY_LABEL = Object.fromEntries(SPEEDUP_CATEGORIES.map((c) => [c.id, c.label]));
const DENOMINATION_LABEL = Object.fromEntries(SPEEDUP_DENOMINATIONS.map((d) => [d.id, d.label]));
export const categoryLabel = (id) => CATEGORY_LABEL[id] || 'Unknown';
export const denominationLabel = (id) => DENOMINATION_LABEL[id] || 'Unknown';

/** Friendly sentence for a scan that did not produce readings. */
export function backpackFailureMessage(result) {
  if (result?.status === 'invalid_image') return 'That picture is too small to read. Use the full-size screenshot.';
  if (result?.reasons?.[0]) return result.reasons[0];
  return 'We could not read this screenshot. Open Backpack > Resources or Backpack > Speedups, take a full screenshot and try again.';
}

const lowest = (...fields) => Math.min(...fields.map((f) => (f ? f.confidence : 0)));
const fieldNeedsCheck = (f) => !f || f.value === null || f.confidence < REVIEW_THRESHOLD || (f.flags && f.flags.length > 0);

/**
 * Merge the results of up to two screenshots (any order, either tab, even the same tab twice).
 * @param {{ index: number, result: object }[]} scans results with status 'ok'
 */
export function mergeScans(scans) {
  const merged = { resources: null, speedups: [], tabs: [], notes: [], duplicates: 0 };
  for (const { index, result } of scans) {
    if (!result || result.status !== 'ok') continue;
    if (!merged.tabs.includes(result.tab)) merged.tabs.push(result.tab);
    if (result.tab === 'resources') {
      if (!merged.resources) merged.resources = {};
      for (const item of RESOURCE_ITEMS) {
        const incoming = result.resources?.[item.id];
        const have = merged.resources[item.id];
        if (!incoming) continue;
        const next = { ...incoming, imageIndex: index };
        if (!have || !have.found) { if (!have || incoming.found) merged.resources[item.id] = next; continue; }
        if (!incoming.found) continue;
        if (incoming.value === have.value) { merged.duplicates += 1; continue; }
        const keep = incoming.confidence > have.confidence ? next : have;
        merged.resources[item.id] = { ...keep, flags: [...keep.flags, 'differs_between_images'], confidence: Math.min(keep.confidence, 0.5) };
      }
    } else {
      for (const row of result.speedups || []) {
        if (row.category.value === 'healing') continue; // healing speedups are not part of this scanner
        const key = row.category.value && row.denomination.value ? `${row.category.value}|${row.denomination.value}` : null;
        const incoming = { ...row, imageIndex: index };
        const at = key ? merged.speedups.findIndex((r) => r.key === key) : -1;
        if (at < 0) { merged.speedups.push({ ...incoming, key }); continue; }
        const have = merged.speedups[at];
        if (have.quantity.value === row.quantity.value) { merged.duplicates += 1; continue; }
        const keep = lowest(row.quantity) > lowest(have.quantity) ? incoming : have;
        merged.speedups[at] = { ...keep, key, quantity: { ...keep.quantity, flags: [...keep.quantity.flags, 'differs_between_images'], confidence: Math.min(keep.quantity.confidence, 0.5) } };
      }
    }
  }
  if (merged.duplicates > 0) merged.notes.push('The same screenshot looks like it was added twice. Each item is counted once.');
  return merged;
}

/**
 * @param {{ index: number, result: object }[]} scans
 * @returns {{ ok: boolean, message?: string, tabs: string[], resourceRows: object[]|null, speedupRows: object[]|null, notes: string[], summary: {total:number,toCheck:number} }}
 */
export function buildBackpackReview(scans) {
  const good = scans.filter((s) => s.result && s.result.status === 'ok');
  if (good.length === 0) {
    return { ok: false, message: backpackFailureMessage(scans.find((s) => s.result)?.result), tabs: [], resourceRows: null, speedupRows: null, notes: [], summary: { total: 0, toCheck: 0 } };
  }
  const merged = mergeScans(good);
  const resourceRows = merged.resources ? RESOURCE_ITEMS.map((item) => {
    const r = merged.resources[item.id] || { found: false, value: null, confidence: 0, flags: ['not_found'] };
    return {
      id: `res:${item.id}`, kind: 'resource', key: item.id, title: item.name, short: item.short,
      found: Boolean(r.found), readValue: r.found ? r.value : null, confidence: r.found ? r.confidence : 1, flags: r.flags || [],
      needsCheck: Boolean(r.found) && fieldNeedsCheck({ value: r.value, confidence: r.confidence, flags: r.flags.filter((f) => f !== 'not_found') }),
      imageIndex: r.imageIndex ?? null, tile: r.tile || null,
    };
  }) : null;
  const speedupRows = merged.tabs.includes('speedups') ? merged.speedups.map((s, i) => {
    const fields = [s.denomination, s.category, s.quantity];
    return {
      id: `spd:${s.imageIndex}:${i}`, kind: 'speedup', imageIndex: s.imageIndex, tile: s.tile,
      readCategory: s.category.value, readDenomination: s.denomination.value, readQuantity: s.quantity.value,
      confidences: { category: s.category.confidence, denomination: s.denomination.confidence, quantity: s.quantity.confidence },
      confidence: lowest(...fields), needsCheck: fields.some(fieldNeedsCheck),
      flags: [...new Set(fields.flatMap((f) => f.flags || []))],
      alternatives: { category: (s.category.alternatives || []).map((a) => a.value), denomination: (s.denomination.alternatives || []).map((a) => a.value) },
    };
  }) : null;
  const all = [...(resourceRows || []), ...(speedupRows || [])];
  return {
    ok: true, tabs: merged.tabs, resourceRows, speedupRows, notes: merged.notes,
    summary: { total: all.length, toCheck: all.filter((r) => r.needsCheck).length },
  };
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const isQuantity = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_QUANTITY;

function speedupFinal(row, edit = {}) {
  return {
    category: 'category' in edit ? edit.category : row.readCategory,
    denomination: 'denomination' in edit ? edit.denomination : row.readDenomination,
    quantity: 'quantity' in edit ? num(edit.quantity) : row.readQuantity,
  };
}

/**
 * Current numbers and what still blocks the Use button.
 * state: { edits: {rowId: {value|quantity|category|denomination}}, confirmed: {rowId:true}, removed: {rowId:true},
 *          added: [{id, category, denomination, quantity}] }
 */
export function evaluateBackpack(review, state = {}) {
  const { edits = {}, confirmed = {}, removed = {}, added = [] } = state;
  const pending = [];
  const lines = [];
  const resources = { tg: null, ttg: null, tg_dust: null };
  for (const row of review.resourceRows || []) {
    const edit = edits[row.id];
    const value = edit && 'value' in edit ? num(edit.value) : row.readValue;
    if (edit && 'value' in edit && value !== null && !isQuantity(value)) pending.push(row.id);
    else if (row.needsCheck && !edit && !confirmed[row.id]) pending.push(row.id);
    resources[row.key] = value !== null && isQuantity(value) ? value : null;
  }
  let minutes = null;
  if (review.speedupRows) {
    minutes = { construction: 0, research: 0, troop: 0, general: 0 };
    const rows = [...review.speedupRows.filter((r) => !removed[r.id]), ...added.map((a) => ({ ...a, manual: true }))];
    for (const row of rows) {
      const f = row.manual ? { category: row.category, denomination: row.denomination, quantity: num(row.quantity) } : speedupFinal(row, edits[row.id]);
      const complete = isCategory(f.category) && isDenomination(f.denomination) && isQuantity(f.quantity);
      const blocked = !complete || (!row.manual && row.needsCheck && !edits[row.id] && !confirmed[row.id]);
      if (blocked) pending.push(row.id);
      const mins = complete ? MINUTES_BY_DENOMINATION[f.denomination] * f.quantity : null;
      if (complete && f.category in minutes) minutes[f.category] += mins;
      lines.push({ id: row.id, ...f, minutes: mins, manual: Boolean(row.manual) });
    }
  }
  const days = minutes ? {
    construction: minutes.construction / MINUTES_PER_DAY,
    // owner rule: research days include general speedups; troop days never do
    research: (minutes.research + minutes.general) / MINUTES_PER_DAY,
    troop: minutes.troop / MINUTES_PER_DAY,
    general: minutes.general / MINUTES_PER_DAY,
  } : null;
  return { pending, resources, minutes, days, lines, ok: pending.length === 0, tabs: review.tabs };
}

/** The small structured snapshot saved with the form record (never the image). */
export function backpackSnapshot(evaluation, { engineVersion, now = new Date() } = {}) {
  return {
    scanned_at: now.toISOString(),
    engine_version: engineVersion || '',
    tg: evaluation.resources.tg,
    ttg: evaluation.resources.ttg,
    tg_dust: evaluation.resources.tg_dust,
    speedup_minutes: evaluation.minutes
      ? { construction: evaluation.minutes.construction, research: evaluation.minutes.research, troop: evaluation.minutes.troop, general: evaluation.minutes.general }
      : { construction: null, research: null, troop: null, general: null },
  };
}

/** What the member changed against what was read (value read vs value chosen; never the image). */
export function backpackCorrections(review, state = {}) {
  const { edits = {}, removed = {}, added = [] } = state;
  const out = [];
  const push = (slot, field, read, conf, corrected) => out.push({ slot, field, read_value: read, read_confidence: Math.round(conf * 1000) / 1000, corrected_value: corrected });
  for (const row of review.resourceRows || []) {
    const edit = edits[row.id];
    if (!edit || !('value' in edit)) continue;
    const value = num(edit.value);
    if (value !== row.readValue) push(`resource.${row.key}`, 'value', row.readValue, row.found ? row.confidence : 0, value);
  }
  for (const row of review.speedupRows || []) {
    const slot = `speedup.${row.readCategory || 'unknown'}.${row.readDenomination || 'unknown'}`;
    if (removed[row.id]) { push(slot, 'row', row.readQuantity, row.confidence, null); continue; }
    const edit = edits[row.id];
    if (!edit) continue;
    const f = speedupFinal(row, edit);
    if (f.category !== row.readCategory) push(slot, 'category', row.readCategory, row.confidences.category, f.category);
    if (f.denomination !== row.readDenomination) push(slot, 'denomination', row.readDenomination, row.confidences.denomination, f.denomination);
    if (f.quantity !== row.readQuantity) push(slot, 'quantity', row.readQuantity, row.confidences.quantity, f.quantity);
  }
  for (const a of added) push(`speedup.${a.category || 'unknown'}.${a.denomination || 'unknown'}`, 'missing', null, 0, num(a.quantity));
  return out.slice(0, 80);
}

/** Where each form box gets its number from. */
export const FILL_SOURCES = ['tg', 'ttg', 'tg_dust', 'research_days', 'troop_days'];

/**
 * The text a form box would be filled with, or null when that number was not read (its screenshot was not added).
 * Counts are whole numbers; days have up to 2 decimals (exact minutes stay in the saved snapshot).
 */
export function fillValueFor(source, evaluation) {
  const count = (n) => (n === null || n === undefined ? null : formatCount(n));
  switch (source) {
    case 'tg': return count(evaluation.resources.tg);
    case 'ttg': return count(evaluation.resources.ttg);
    case 'tg_dust': return count(evaluation.resources.tg_dust);
    case 'research_days': return evaluation.days ? formatDays(evaluation.days.research) : null;
    case 'troop_days': return evaluation.days ? formatDays(evaluation.days.troop) : null;
    default: return null;
  }
}
