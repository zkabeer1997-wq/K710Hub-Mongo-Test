// Page addresses: a SuperAdmin can give a built-in public page a different
// public address (e.g. /guides -> /guides-lol). Pure logic only (no I/O), so
// it is shared by the proxy, the API, the admin page and the tests.
//
// Semantics (see proxy.js):
//   request for the NEW address (/guides-lol/...) -> internal rewrite to the
//     canonical path (/guides/...); auth gating runs on the canonical path;
//   request for the OLD canonical address (/guides/...) -> 308 redirect to the
//     new address, query string preserved.

// Every top-level public page that may be renamed. Keep in sync with app/:
// tests/routeAliases.test.mjs fails if a new app/ route is not classified.
export const RENAMEABLE_ROUTES = [
  { path: '/about', label: 'About' },
  { path: '/alliances', label: 'Alliances' },
  { path: '/dashboard', label: 'Member login (Gatehouse)' },
  { path: '/events', label: 'Events' },
  { path: '/flamedragon', label: 'Flamedragon Tyrant form' },
  { path: '/forms', label: 'Member forms' },
  { path: '/gallery', label: 'Gallery' },
  { path: '/glossary', label: 'Glossary' },
  { path: '/lore', label: 'Lore' },
  { path: '/guides', label: 'Guides' },
  { path: '/help', label: 'Help' },
  { path: '/interest', label: 'Transfer interest' },
  { path: '/login', label: 'Login' },
  { path: '/power-profile', label: 'Power profile' },
  { path: '/prep-phase-backpack', label: 'Prep phase backpack' },
  { path: '/timeline', label: 'Timeline' },
  { path: '/tools', label: 'Tools' },
];

// Top-level app/ entries that can never be renamed (not public pages, or special).
export const PROTECTED_APP_ENTRIES = ['admin', 'api', 'gate'];

// Words an address may never be, on top of every built-in route name.
export const RESERVED_WORDS = [
  'api', 'admin', '_next', 'gate', 'sitemap', 'robots', 'manifest', 'favicon',
  'icon', 'apple-touch-icon', 'opengraph-image', 'static', 'public', 'null', 'undefined',
];

export const MAX_ADDRESS_LENGTH = 60;
export const ALIAS_CACHE_MS = 15000;

const ADDRESS_PATTERN = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function renameableRoute(path) {
  return RENAMEABLE_ROUTES.find((r) => r.path === path) || null;
}

/** Lower-level helper: trim only; never "fixes" bad input silently. */
export function cleanAddress(value) {
  return String(value ?? '').trim();
}

/**
 * Validate one change. `existing` is the current list/map of aliases
 * ({from, to}[] or {from: to}) used for collision checks (the row being
 * edited is ignored). Returns { ok: true, from, to } or { ok: false, error }.
 */
export function validateAlias(fromInput, toInput, existing = []) {
  const from = cleanAddress(fromInput);
  const to = cleanAddress(toInput);
  if (!renameableRoute(from)) return { ok: false, error: 'That page cannot be renamed.' };
  if (!to) return { ok: false, error: 'Enter the new address.' };
  if (to.length > MAX_ADDRESS_LENGTH) return { ok: false, error: `Use ${MAX_ADDRESS_LENGTH} characters or fewer.` };
  if (!to.startsWith('/')) return { ok: false, error: 'The address must start with a slash, like /guides-lol.' };
  if (to.length > 1 && to.endsWith('/')) return { ok: false, error: 'Remove the slash at the end.' };
  if (to.includes('..')) return { ok: false, error: 'Dots are not allowed in an address.' };
  if (/\s/.test(to)) return { ok: false, error: 'Spaces are not allowed. Use a dash instead.' };
  if (/[A-Z]/.test(to)) return { ok: false, error: 'Use lowercase letters only.' };
  if (to.slice(1).includes('/')) return { ok: false, error: 'Use a single word or dashed words, with no extra slashes.' };
  if (!ADDRESS_PATTERN.test(to)) return { ok: false, error: 'Use only lowercase letters, numbers and single dashes (for example /guides-lol).' };
  if (to === from) return { ok: false, error: 'That is already the default address. Use Reset to default instead.' };

  const word = to.slice(1);
  if (RESERVED_WORDS.includes(word) || PROTECTED_APP_ENTRIES.includes(word)) {
    return { ok: false, error: 'That address is reserved. Choose another.' };
  }
  if (RENAMEABLE_ROUTES.some((r) => r.path === to)) {
    return { ok: false, error: 'That address belongs to another built-in page. Choose another.' };
  }
  const rows = Array.isArray(existing)
    ? existing
    : Object.entries(existing || {}).map(([f, t]) => ({ from: f, to: t }));
  if (rows.some((r) => r.from !== from && r.to === to)) {
    return { ok: false, error: 'Another page already uses that address.' };
  }
  return { ok: true, from, to };
}

/** Turn stored rows into a safe {from: to} map; invalid rows are dropped. */
export function buildAliasMap(rows) {
  const map = {};
  const used = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const check = validateAlias(row?.from, row?.to, []);
    if (!check.ok || used.has(check.to) || map[check.from]) continue;
    map[check.from] = check.to;
    used.add(check.to);
  }
  return map;
}

/**
 * Decide what to do with a request path.
 *   { action: 'redirect', pathname }  old canonical address -> new address
 *   { action: 'rewrite', pathname }   new address -> canonical path
 *   { action: 'none' }
 * Admin, API, _next and gate paths are never touched.
 */
export function resolveAlias(pathname, map) {
  const path = String(pathname || '');
  if (!map || path === '/' || !path.startsWith('/')) return { action: 'none' };
  if (/^\/(api|admin|_next|gate)(\/|$)/.test(path)) return { action: 'none' };
  for (const [from, to] of Object.entries(map)) {
    if (path === to || path.startsWith(`${to}/`)) {
      return { action: 'rewrite', pathname: from + path.slice(to.length) };
    }
  }
  for (const [from, to] of Object.entries(map)) {
    if (path === from || path.startsWith(`${from}/`)) {
      return { action: 'redirect', pathname: to + path.slice(from.length) };
    }
  }
  return { action: 'none' };
}

/** Public address for a canonical path (keeps any sub-path). */
export function publicPath(path, map) {
  const r = resolveAlias(path, map);
  return r.action === 'redirect' ? r.pathname : path;
}
