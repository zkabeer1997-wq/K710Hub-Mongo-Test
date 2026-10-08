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
 * @returns {{fields: object, error: string|null}}
 */
export function sanitizeKvkTroops(body) {
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
    const heroes = [...new Set(input.heroes.map(clean).filter(Boolean))];
    if (heroes.some((hero) => !HEROES.includes(hero))) return { fields: {}, error: 'Choose heroes from the list.' };
    fields.heroes = heroes;
  }
  return { fields, error: null };
}

/** Pick only the troop + hero fields of a stored row (any source), normalising blanks. */
export function troopFieldsOf(row) {
  const out = {};
  for (const key of TROOP_FIELD_KEYS) out[key] = row && row[key] ? String(row[key]) : '';
  // Heroes removed from the roster since the member saved are dropped silently.
  out.heroes = Array.isArray(row?.heroes) ? row.heroes.map(String).filter((h) => HEROES.includes(h)) : [];
  return out;
}

export const hasTroopData = (row) => {
  const t = troopFieldsOf(row);
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
