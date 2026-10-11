// Editable reference tables on Admin > Packs/Tools > Tool database: the charm level table and the
// governor gear tier table that used to be read-only. The built-in modules (lib/phase2Data.mjs)
// stay the fallback; an admin edit is stored as a full override of the table's editable numbers
// and "reset" deletes the override. Pure helpers only (validation and merging).
import { CHARM_LEVELS, GOVERNOR_GEAR_LEVELS } from './phase2Data.mjs';

const int = (min, max) => ({ min, max, decimals: 0 });
const dec = (min, max, decimals = 2) => ({ min, max, decimals });

export const REFERENCE_TABLES = Object.freeze({
  'charm-levels': {
    label: 'Charm levels',
    idLabel: 'Level',
    columns: [
      { key: 'guides', label: 'Guides', ...int(0, 1_000_000) },
      { key: 'designs', label: 'Designs', ...int(0, 1_000_000) },
      { key: 'health', label: 'Health / Lethality', ...int(0, 100_000) },
      { key: 'power', label: 'Power', ...int(0, 1_000_000_000) },
    ],
    // Which member tools read the override (shown to the admin so nothing is implied).
    usedBy: 'Charms Optimizer (Health / Lethality and Power). Guides and Designs here are reference only: the planner takes upgrade costs from the calculator data above.',
  },
  'gear-tiers': {
    label: 'Governor gear tiers',
    idLabel: 'Tier',
    columns: [
      { key: 'satin', label: 'Satin', ...int(0, 1_000_000_000) },
      { key: 'threads', label: 'Gilded Threads', ...int(0, 100_000_000) },
      { key: 'visions', label: "Artisan's Vision", ...int(0, 10_000_000) },
      { key: 'power', label: 'Power', ...int(0, 10_000_000_000) },
      { key: 'statGain', label: 'Stat bonus %', ...dec(0, 100) },
      { key: 'setBonus', label: 'Set bonus %', ...dec(0, 100) },
    ],
    usedBy: 'Saved for reference. The Governor Gear planners still read the built-in tier table, so editing it does not change their results yet.',
  },
});

export const REFERENCE_TABLE_KEYS = Object.freeze(Object.keys(REFERENCE_TABLES));

export function isReferenceTable(key) {
  return typeof key === 'string' && Object.hasOwn(REFERENCE_TABLES, key);
}

/** Built-in rows: [{ id, label, <column>: n }]. */
export function builtInRows(key) {
  if (key === 'charm-levels') {
    return CHARM_LEVELS.filter(Boolean).map((r) => ({ id: r.level, label: `Level ${r.level}`, guides: r.guides, designs: r.designs, health: r.health, power: r.power }));
  }
  if (key === 'gear-tiers') {
    return GOVERNOR_GEAR_LEVELS.map((r) => ({ id: r.index, label: r.tier, satin: r.satin, threads: r.threads, visions: r.visions, power: r.power, statGain: r.statGain, setBonus: r.setBonus }));
  }
  return [];
}

function numberError(col, n, who) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return `${who}: ${col.label} must be a number.`;
  if (n < col.min || n > col.max) return `${who}: ${col.label} must be from ${col.min.toLocaleString('en-US')} to ${col.max.toLocaleString('en-US')}.`;
  const scale = 10 ** col.decimals;
  if (Math.abs(n * scale - Math.round(n * scale)) > 1e-6) {
    return `${who}: ${col.label} ${col.decimals ? `can have at most ${col.decimals} decimals` : 'must be a whole number'}.`;
  }
  return '';
}

/**
 * Validate a submitted table. Must contain exactly the built-in row ids, once each. Returns
 * { rows } (normalized, ordered like the built-in table) or { error }.
 */
export function validateReferenceRows(key, rows) {
  const spec = REFERENCE_TABLES[key];
  if (!spec) return { error: 'Choose a supported table.' };
  if (!Array.isArray(rows)) return { error: 'Send the table rows.' };
  const base = builtInRows(key);
  if (rows.length !== base.length) return { error: `${spec.label} must have exactly ${base.length} rows.` };
  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'Invalid row.' };
    if (byId.has(row.id)) return { error: `Row ${row.id} appears twice.` };
    byId.set(row.id, row);
  }
  const out = [];
  for (const b of base) {
    const row = byId.get(b.id);
    if (!row) return { error: `Row ${b.label} is missing.` };
    const next = { id: b.id };
    for (const col of spec.columns) {
      const n = row[col.key];
      const msg = numberError(col, n, b.label);
      if (msg) return { error: msg };
      next[col.key] = col.decimals ? Math.round(n * 10 ** col.decimals) / 10 ** col.decimals : n;
    }
    out.push(next);
  }
  return { rows: out };
}

/** Built-in rows with a stored override laid over them. A malformed override is ignored. */
export function mergeReferenceRows(key, stored) {
  const base = builtInRows(key);
  if (!Array.isArray(stored)) return base;
  const checked = validateReferenceRows(key, stored);
  if (checked.error) return base;
  const byId = new Map(checked.rows.map((r) => [r.id, r]));
  return base.map((b) => ({ ...b, ...byId.get(b.id) }));
}

/** Charm level table in the lib/phase2Data.mjs shape (index = level, [0] = null). */
export function charmLevelsFromRows(rows) {
  const out = [null];
  for (const r of rows) out[r.id] = { level: r.id, guides: r.guides, designs: r.designs, health: r.health, lethality: r.health, power: r.power };
  return out;
}

/** True when an override differs from the built-in values anywhere. */
export function differsFromBuiltIn(key, rows) {
  const base = builtInRows(key);
  const cols = REFERENCE_TABLES[key].columns;
  return rows.some((r, i) => cols.some((c) => r[c.key] !== base[i]?.[c.key]));
}
