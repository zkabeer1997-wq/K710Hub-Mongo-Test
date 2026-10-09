// Pure helpers for the KvK Availability form's troop levels and hero roster. These answers are
// per KvK cycle: they live on the member's roster (submissions) row next to availability, and the
// previous cycle's answers (or the old Power Profile values) are offered as a prefill.
import { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS } from './playerCombatOptions.mjs';

export const TROOP_FIELD_KEYS = PROFILE_UNIT_FIELDS.flatMap((unit) => [unit.tier, unit.tg]);

const clean = (value) => String(value == null ? '' : value).trim();

/**
 * Validates the optional troop level + hero fields of a kvk-availability POST.
 * A field that is absent from the body is left out of `fields` (the stored value stays as it is);
 * a field sent as '' is stored as null (cleared). Unknown tiers/TGs/heroes are rejected.
 * `allowedHeroes` = the names currently offered (the hero catalog's active heroes; defaults to the
 * built-in list). `existingHeroes` = names the member already has saved: if one of those is no longer
 * offered it is dropped silently instead of failing the save (a stale form must never get a 400).
 * @returns {{fields: object, error: string|null}}
 */
export function sanitizeKvkTroops(body, { allowedHeroes = HEROES, existingHeroes = [] } = {}) {
  const fields = {};
  const input = body || {};
  for (const unit of PROFILE_UNIT_FIELDS) {
    for (const [key, allowed, noun] of [[unit.tier, TROOP_TIERS, 'tier'], [unit.tg, TROOP_TGS, 'TG']]) {
      if (input[key] === undefined) continue;
      const value = clean(input[key]);
      if (value && !allowed.includes(value)) return { fields: {}, error: `Choose a valid ${unit.label} ${noun}.` };
      fields[key] = value || null;
    }
  }
  if (input.heroes !== undefined) {
    if (!Array.isArray(input.heroes)) return { fields: {}, error: 'Heroes must be a list.' };
    const stored = new Set((Array.isArray(existingHeroes) ? existingHeroes : []).map(String));
    const heroes = [...new Set(input.heroes.map(clean).filter(Boolean))]
      .filter((hero) => allowedHeroes.includes(hero) || !stored.has(hero));
    if (heroes.some((hero) => !allowedHeroes.includes(hero))) return { fields: {}, error: 'Choose heroes from the list.' };
    fields.heroes = heroes;
  }
  return { fields, error: null };
}

/**
 * Troop tier + TG for Infantry, Cavalry and Archer are REQUIRED on the KvK Availability and
 * Flamedragon Tyrant forms (heroes stay optional). Pure: returns a plain-language message naming
 * what is missing, or null when all six are present and valid.
 * @param {object} fields values keyed infantry_tier, infantry_tg, ... (absent/blank = missing)
 * @returns {string|null}
 */
export function missingTroopsMessage(fields) {
  const input = fields || {};
  const missing = [];
  const invalid = [];
  for (const unit of PROFILE_UNIT_FIELDS) {
    for (const [key, allowed, noun] of [[unit.tier, TROOP_TIERS, 'tier'], [unit.tg, TROOP_TGS, 'TG']]) {
      const value = clean(input[key]);
      if (!value) missing.push(`${unit.label} ${noun}`);
      else if (!allowed.includes(value)) invalid.push(`${unit.label} ${noun}`);
    }
  }
  if (invalid.length) return `Choose a valid ${invalid[0]}.`;
  if (!missing.length) return null;
  return `Choose a troop tier and TG for every troop type. Missing: ${missing.join(', ')}.`;
}

/**
 * Per-field errors for the member forms: { infantry_tier: 'Choose a tier for Infantry.', ... } for
 * every troop field that is blank or not an allowed option (empty object = all good). Same rule the
 * server enforces, so the form can flag the exact selects before sending.
 */
export function troopFieldErrors(values) {
  const input = values || {};
  const errors = {};
  for (const unit of PROFILE_UNIT_FIELDS) {
    for (const [key, allowed, noun] of [[unit.tier, TROOP_TIERS, 'tier'], [unit.tg, TROOP_TGS, 'TG']]) {
      if (!allowed.includes(clean(input[key]))) errors[key] = `Choose a ${noun} for ${unit.label}.`;
    }
  }
  return errors;
}

/**
 * sanitizeKvkTroops + the required-troops rule. Same return shape; `error` is set when any of the
 * six troop fields is missing or not an allowed value. Values only count when they are in the
 * request body, so a stale client cannot skip them.
 */
export function sanitizeRequiredKvkTroops(body, options) {
  const result = sanitizeKvkTroops(body, options);
  if (result.error) return result;
  const error = missingTroopsMessage(result.fields);
  return error ? { fields: {}, error } : result;
}

/**
 * The $set document that remembers a member's troops + heroes on their profile (power_profiles).
 * Only the troop tier/TG keys and heroes that are in `fields` are written; nothing else on the
 * profile (governor_gear, charms, hero_gear, pet_power, masters_power, mystic_trial_score) is
 * touched, and the Power Profile's own `updated_at` is deliberately NOT set so this never makes a
 * member count as having filled in the Power Profile form.
 * @returns {object|null} null when there is nothing to remember
 */
export function buildTroopProfileSet(fields, now = new Date()) {
  const set = {};
  for (const key of TROOP_FIELD_KEYS) {
    const value = clean(fields && fields[key]);
    if (value) set[key] = value;
  }
  if (fields && Array.isArray(fields.heroes)) set.heroes = [...new Set(fields.heroes.map(clean).filter(Boolean))];
  if (!Object.keys(set).length) return null;
  set.troop_updated_at = now;
  return set;
}

/**
 * Prefill sources best first. The profile now holds the latest troops the member saved on EITHER
 * form (troop_updated_at set), so it outranks an earlier cycle's row; an old Power Profile (no
 * troop_updated_at) stays the last resort, as before.
 */
export function orderTroopSources({ record, previous, profile }) {
  const first = { row: record, from: 'record' };
  const prev = { row: previous, from: 'previous' };
  if (profile && profile.troop_updated_at) {
    // Remembered from the member's own earlier answers, so it is labelled like an earlier cycle's, not like an old Power Profile.
    return [first, { row: profile, from: 'previous' }, prev];
  }
  return [first, prev, { row: profile, from: 'profile' }];
}

/** Pick only the troop + hero fields of a stored row (any source), normalising blanks. */
export function troopFieldsOf(row, heroList = HEROES) {
  const out = {};
  for (const key of TROOP_FIELD_KEYS) out[key] = row && row[key] ? String(row[key]) : '';
  // Heroes removed from the roster since the member saved are dropped silently.
  out.heroes = Array.isArray(row?.heroes) ? row.heroes.map(String).filter((h) => heroList.includes(h)) : [];
  return out;
}

export const hasTroopData = (row, heroList = HEROES) => {
  const t = troopFieldsOf(row, heroList);
  return t.heroes.length > 0 || TROOP_FIELD_KEYS.some((key) => t[key]);
};

const TIER_KEYS = new Set(PROFILE_UNIT_FIELDS.map((u) => u.tier));
const allowedValue = (key, value) => Boolean(value) && (TIER_KEYS.has(key) ? TROOP_TIERS : TROOP_TGS).includes(String(value));

/**
 * Troop levels and heroes to show on the form. Sources, best first:
 * [{ row, from: 'record' | 'previous' | 'profile' }]. Troops and heroes are chosen independently
 * so a cycle answer that only has heroes still gets troop levels from an older source.
 * @returns {{troops: object, heroes: string[], troopsFrom: string|null, heroesFrom: string|null}}
 */
export function resolveTroopPrefill(sources, heroList = HEROES) {
  const list = (sources || []).filter((s) => s && s.row);
  const troops = Object.fromEntries(TROOP_FIELD_KEYS.map((key) => [key, '']));
  const rank = { record: 0, previous: 1, profile: 2 };
  let troopsFrom = null;
  for (const key of TROOP_FIELD_KEYS) {
    // Old values that are no longer valid options (e.g. a retired tier) are not offered.
    const hit = list.find((s) => allowedValue(key, s.row[key]));
    if (!hit) continue;
    troops[key] = String(hit.row[key]);
    // Label by the most carried-over source used, so the notice is honest.
    if (troopsFrom === null || rank[hit.from] > rank[troopsFrom]) troopsFrom = hit.from;
  }
  const validHeroes = (row) => (Array.isArray(row.heroes) ? row.heroes.map(String).filter((h) => heroList.includes(h)) : []);
  const heroHit = list.find((s) => validHeroes(s.row).length);
  return {
    troops,
    heroes: heroHit ? validHeroes(heroHit.row) : [],
    troopsFrom,
    heroesFrom: heroHit ? heroHit.from : null,
  };
}
