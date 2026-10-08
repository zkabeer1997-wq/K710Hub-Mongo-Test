// Pure logic behind the scan review screen: ScanResult -> rows the owner confirms -> board values + corrections.
// No DOM, no React: tested in tests/scanReview.test.mjs. Stored formats are the board's own ('Gold T3 ★★', 'Level 12').
import { needsReview } from './readingUtils.mjs';
import { CHARM_SLOTS, GEAR_SLOTS, QUALITIES, isValidGearState } from './kinds/governorProfile/gameData.mjs';
import { LOADOUT_PIECES, composeGearValue, gearSpoken, parseGearValue } from '../loadout.mjs';

export const REVIEW_THRESHOLD = 0.8;
const QUALITY_NAME = new Map(QUALITIES.map((q) => [q.id, q.name]));
const GEAR_FIELDS = ['quality', 'tier', 'stars'];

/** Friendly sentence for a scan that did not produce readings. */
export function scanFailureMessage(result) {
  if (!result || result.status === 'failed') return 'We could not read this screenshot. Try again with a clear, full screenshot of Governor Profile.';
  if (result.status === 'invalid_image') return 'This does not look like a full Governor Profile screenshot. Take a new one and add it again.';
  return 'Screenshot scanning is not ready yet. Please set your gear on the board.';
}

const pieceById = new Map(LOADOUT_PIECES.map((p) => [p.id, p]));
const pieceByCharmKey = new Map(LOADOUT_PIECES.flatMap((p) => p.charmKeys.map((k, i) => [k, { piece: p, index: i }])));

function charmStored(level) {
  return Number.isInteger(level) && level >= 1 && level <= 22 ? `Level ${level}` : '';
}

function gearStored(q, t, s) {
  if (!QUALITY_NAME.has(q)) return '';
  if (!isValidGearState(q, t, s)) return '';
  return composeGearValue({ quality: q, tier: t, stars: s });
}

function gearAlternatives(reading, own) {
  const out = [];
  const base = { quality: reading.quality.value, tier: reading.tier.value, stars: reading.stars.value };
  for (const field of GEAR_FIELDS) {
    for (const alt of reading[field].alternatives || []) {
      const state = { ...base, [field]: alt.value };
      if (state.quality === null || state.tier === null || state.stars === null) continue;
      const stored = gearStored(state.quality, state.tier, state.stars);
      if (stored && stored !== own && !out.includes(stored)) out.push(stored);
    }
  }
  return out.slice(0, 4);
}

const EMPTY_FIELD = { value: null, confidence: 0, flags: [] };

/**
 * @param {object} result a ScanResult with status 'ok'
 * @returns {{ ok: boolean, message?: string, rows: object[], summary: { total: number, confident: number, toCheck: number, text: string } }}
 * Row: { id, kind: 'gear'|'charm', slot, boardKey, pieceId, title, readValue (stored string, '' = nothing),
 *        fields: [{ field, value, confidence }], confidence (lowest), needsCheck, alternatives: stored strings }
 */
export function buildReviewRows(result) {
  if (!result || result.status !== 'ok') return { ok: false, message: scanFailureMessage(result), rows: [], summary: summarize([]) };
  const gearBySlot = new Map((result.gear || []).map((g) => [g.slot, g]));
  const charmBySlot = new Map((result.charms || []).map((c) => [c.slot, c]));
  const rows = [];
  for (const slot of GEAR_SLOTS) {
    const piece = pieceById.get(slot);
    const raw = gearBySlot.get(slot) || {};
    const reading = { quality: raw.quality || EMPTY_FIELD, tier: raw.tier || EMPTY_FIELD, stars: raw.stars || EMPTY_FIELD };
    const readValue = gearStored(reading.quality.value, reading.tier.value, reading.stars.value);
    rows.push({
      id: `gear:${slot}`, kind: 'gear', slot, boardKey: piece.gearKey, pieceId: slot,
      title: `${piece.name} (${piece.troopName})`,
      readValue,
      fields: GEAR_FIELDS.map((field) => ({ field, value: reading[field].value, confidence: reading[field].confidence })),
      confidence: Math.min(...GEAR_FIELDS.map((f) => reading[f].confidence)),
      needsCheck: !readValue || needsReview(reading, REVIEW_THRESHOLD),
      alternatives: gearAlternatives(reading, readValue),
    });
  }
  for (const slot of CHARM_SLOTS) {
    const { piece, index } = pieceByCharmKey.get(slot);
    const level = (charmBySlot.get(slot) || {}).level || EMPTY_FIELD;
    const readValue = charmStored(level.value);
    const alternatives = (level.alternatives || []).map((a) => charmStored(a.value)).filter((v) => v && v !== readValue);
    rows.push({
      id: `charm:${slot}`, kind: 'charm', slot, boardKey: slot, pieceId: piece.id, charmIndex: index,
      title: `${piece.name} charm ${index + 1}`,
      readValue,
      fields: [{ field: 'level', value: level.value, confidence: level.confidence }],
      confidence: level.confidence,
      needsCheck: !readValue || needsReview(level, REVIEW_THRESHOLD),
      alternatives: [...new Set(alternatives)].slice(0, 4),
    });
  }
  return { ok: true, rows, summary: summarize(rows) };
}

export function summarize(rows) {
  const total = rows.length;
  const toCheck = rows.filter((r) => r.needsCheck).length;
  const confident = total - toCheck;
  return { total, confident, toCheck, text: `${confident} of ${total} read confidently, ${toCheck} to check` };
}

/** Rows that still block the Use button: needs a check and neither corrected nor confirmed. */
export function pendingRows(rows, { edits = {}, confirmed = {} } = {}) {
  return rows.filter((r) => r.needsCheck && !(r.id in edits) && !confirmed[r.id]);
}

export function currentValue(row, edits = {}) {
  return row.id in edits ? edits[row.id] : row.readValue;
}

/** Short spoken/printed description of a stored value for a row. */
export function describeValue(row, value) {
  if (row.kind === 'charm') return value || 'Not set';
  return gearSpoken(value) || 'No gear';
}

/**
 * Reviewed rows -> board updates and corrections. Never applies while anything still needs a check.
 * @returns {{ ok: boolean, pending: string[], gear: Record<string,string>, charms: Record<string,string>, corrections: object[] }}
 */
export function applyReview(rows, { edits = {}, confirmed = {} } = {}) {
  const pending = pendingRows(rows, { edits, confirmed }).map((r) => r.id);
  const gear = {};
  const charms = {};
  const corrections = [];
  for (const row of rows) {
    const value = currentValue(row, edits);
    if (row.kind === 'gear') gear[row.boardKey] = value;
    else charms[row.boardKey] = value;
    if (value === row.readValue) continue;
    if (row.kind === 'charm') {
      const f = row.fields[0];
      const level = Number(String(value).replace(/^Level\s*/, ''));
      corrections.push({ slot: row.slot, field: 'level', read_value: f.value, read_confidence: f.confidence, corrected_value: value ? level : null });
    } else {
      const now = parseGearValue(value);
      for (const f of row.fields) {
        const corrected = now ? now[f.field] : null;
        if (corrected !== (f.value ?? null) && !(now === null && f.field !== 'quality')) {
          corrections.push({ slot: row.slot, field: f.field, read_value: f.value ?? null, read_confidence: f.confidence, corrected_value: corrected });
        }
      }
    }
  }
  return { ok: pending.length === 0, pending, gear, charms, corrections };
}
