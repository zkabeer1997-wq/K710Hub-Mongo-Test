// Pure helpers shared by the multi-step forms (/interest, /power-profile):
// step <-> URL (?step=N, 1-based) and local draft (de)serialisation.
// Framework-free so they can be unit tested with `node --test`.

export const DRAFT_VERSION = 1;

// Words that mark a field as never-persist (checked per camel/snake word, so
// "passesRequired" is fine but "memberPin" / "admin_password" are dropped).
const SENSITIVE_WORDS = new Set(['pin', 'pass', 'password', 'passcode', 'secret', 'token', 'screenshot', 'screenshots', 'file', 'files', 'upload', 'uploads']);

export function isSensitiveKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((word) => SENSITIVE_WORDS.has(word.toLowerCase()));
}

/** Storage key for a form's draft, e.g. `k710-draft:interest:v1`. */
export function draftKey(formName, version = DRAFT_VERSION) {
  return `k710-draft:${formName}:v${version}`;
}

/**
 * Parses a `?step=` value (1-based) into a zero-based index clamped to
 * [0, stepCount - 1]. Missing / non-numeric / fractional input gives 0.
 */
export function parseStepParam(value, stepCount) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) return 0;
  return clampIndex(Number.parseInt(text, 10) - 1, stepCount);
}

/** Clamps an index into [0, stepCount - 1]. */
export function clampIndex(index, stepCount) {
  const max = Math.max(0, (Number(stepCount) || 1) - 1);
  if (!Number.isFinite(index)) return 0;
  return Math.min(max, Math.max(0, Math.trunc(index)));
}

/**
 * A step can't be deep-linked past validation: given the requested index
 * and the index of the first step that doesn't pass validation (or -1 /
 * null when every step is valid), returns the furthest allowed index.
 */
export function limitToValidStep(requested, firstInvalidIndex, stepCount) {
  const wanted = clampIndex(requested, stepCount);
  if (firstInvalidIndex === null || firstInvalidIndex === undefined || firstInvalidIndex < 0) return wanted;
  return Math.min(wanted, clampIndex(firstInvalidIndex, stepCount));
}

/** Index of the first step whose validator returns a non-empty error list, else -1. */
export function firstInvalidStep(stepCount, validateStep) {
  for (let i = 0; i < stepCount - 1; i += 1) {
    const errors = validateStep(i);
    if (errors && errors.length) return i;
  }
  return -1;
}

/** Builds a URL search string with `step` (1-based) set, preserving other params. */
export function withStepParam(search, index) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  params.set('step', String(index + 1));
  return `?${params.toString()}`;
}

// `Blob` / `File` may not exist in every runtime; guard the instanceof.
const BlobType = typeof Blob === 'undefined' ? class {} : Blob;

/** Drops sensitive keys, functions and Blobs; recurses into plain objects. */
export function stripSensitive(values) {
  const out = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (isSensitiveKey(key)) continue;
    if (typeof value === 'function' || value instanceof BlobType) continue;
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? stripSensitive(value) : value;
  }
  return out;
}

/** Serialises a draft: versioned envelope, sensitive keys removed. */
export function serializeDraft(values, now = Date.now()) {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, data: stripSensitive(values) });
}

/**
 * Parses a stored draft. Returns the data object, or null for anything
 * malformed, from another version, or older than maxAgeMs.
 */
export function parseDraft(raw, { now = Date.now(), maxAgeMs = 30 * 24 * 3600 * 1000 } = {}) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== DRAFT_VERSION || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) return null;
    if (typeof parsed.savedAt === 'number' && now - parsed.savedAt > maxAgeMs) return null;
    return stripSensitive(parsed.data);
  } catch {
    return null;
  }
}

/** Merges a stored draft over defaults, only for keys that exist in defaults and match their type. */
export function mergeDraft(defaults, draft) {
  if (!draft) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!(key in draft)) continue;
    const a = defaults[key];
    const b = draft[key];
    if (Array.isArray(a) ? Array.isArray(b) : typeof a === typeof b) out[key] = b;
  }
  return out;
}
