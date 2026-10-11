// Admin-created named tables on Admin > Packs/Tools > Tool database. A database is a simple grid:
// a name, 1-12 numeric columns, up to 200 labelled rows with one finite number per column.
// Pure helpers (validation, ordering, id).

export const MAX_DATABASES = 20;
export const MAX_COLUMNS = 12;
export const MAX_ROWS = 200;
export const NAME_MAX = 60;
export const COLUMN_NAME_MAX = 40;
export const ROW_LABEL_MAX = 60;
export const VALUE_LIMIT = 1_000_000_000_000;
export const MAX_DECIMALS = 4;

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const BAD = /[\u0000-\u001f\u007f<>]/;
const same = (a, b) => a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en');

export function newDatabaseId() {
  return `db-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function isDatabaseId(id) {
  return typeof id === 'string' && /^db-[a-z0-9]{6,24}$/.test(id);
}

function textError(label, value, max) {
  if (!value) return `Enter ${label}.`;
  if (value.length > max) return `${label[0].toUpperCase()}${label.slice(1)} can be at most ${max} characters.`;
  if (BAD.test(value)) return `${label[0].toUpperCase()}${label.slice(1)} cannot contain < > or control characters.`;
  return '';
}

/**
 * Validate a database. `otherNames` = names of the other databases (case-insensitive unique).
 * Returns { value: { name, columns: string[], rows: [{ label, values: number[] }] } } or { error }.
 */
export function validateDatabase(input, otherNames = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid database.' };
  const name = clean(input.name);
  let msg = textError('a database name', name, NAME_MAX);
  if (msg) return { error: msg };
  if (otherNames.some((n) => same(n, name))) return { error: `A database named "${name}" already exists.` };

  if (!Array.isArray(input.columns) || input.columns.length < 1) return { error: 'Add at least one column.' };
  if (input.columns.length > MAX_COLUMNS) return { error: `At most ${MAX_COLUMNS} columns.` };
  const columns = [];
  for (const [i, raw] of input.columns.entries()) {
    const col = clean(raw);
    msg = textError(`a name for column ${i + 1}`, col, COLUMN_NAME_MAX);
    if (msg) return { error: msg };
    if (columns.some((c) => same(c, col))) return { error: `Two columns are called "${col}". Column names must be unique.` };
    columns.push(col);
  }

  if (!Array.isArray(input.rows)) return { error: 'Send the rows.' };
  if (input.rows.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} rows.` };
  const rows = [];
  for (const [r, raw] of input.rows.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `Row ${r + 1} is invalid.` };
    const label = clean(raw.label);
    msg = textError(`a label for row ${r + 1}`, label, ROW_LABEL_MAX);
    if (msg) return { error: msg };
    if (rows.some((x) => same(x.label, label))) return { error: `Two rows are called "${label}". Row labels must be unique.` };
    if (!Array.isArray(raw.values) || raw.values.length !== columns.length) return { error: `Row "${label}" needs exactly ${columns.length} value${columns.length === 1 ? '' : 's'}.` };
    const values = [];
    for (const [c, n] of raw.values.entries()) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return { error: `Row "${label}", ${columns[c]}: enter a number.` };
      if (Math.abs(n) > VALUE_LIMIT) return { error: `Row "${label}", ${columns[c]}: keep numbers within +/- ${VALUE_LIMIT.toLocaleString('en-US')}.` };
      const scale = 10 ** MAX_DECIMALS;
      if (Math.abs(n * scale - Math.round(n * scale)) > 1e-6) return { error: `Row "${label}", ${columns[c]}: at most ${MAX_DECIMALS} decimals.` };
      values.push(Math.round(n * scale) / scale);
    }
    rows.push({ label, values });
  }
  return { value: { name, columns, rows } };
}

export function sortDatabases(docs) {
  return [...docs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/** New order values after moving `id` one step ("up" | "down"); returns [{id, order}] or null. */
export function reorderDatabases(docs, id, direction) {
  const list = sortDatabases(docs);
  const i = list.findIndex((d) => d.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((d, order) => ({ id: d.id, order }));
}

export function publicDatabase(doc) {
  return {
    id: doc.id,
    name: doc.name,
    columns: doc.columns,
    rows: doc.rows,
    order: doc.order ?? 0,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : null,
    updated_at: doc.updated_at ? new Date(doc.updated_at).toISOString() : null,
  };
}
