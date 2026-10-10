// UI-side helpers for the member sign-in screens. Nothing here decides who may
// see a page: proxy.js and the API routes stay the only authority. These only
// shape what the sign-in card says and where it sends the visitor afterwards.

// Mirror of MEMBER_PREFIXES in proxy.js (a test keeps the two lists in sync).
// Routes in this list send signed-out visitors to the sign-in card.
export const MEMBER_ROUTE_PREFIXES = [
  '/forms',
  '/dashboard/form',
  '/power-profile',
  '/flamedragon',
  '/prep-phase-backpack',
  '/tools',
];

function pathOnly(href) {
  return String(href || '').split(/[?#]/)[0];
}

/** True when a signed-out visitor is redirected to sign in before this page. */
export function routeNeedsSignIn(href) {
  const path = pathOnly(href);
  return MEMBER_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

// Same-origin relative paths only. Rejects protocol-relative URLs (//host),
// backslash tricks (/\host, which browsers read as //host), control characters
// and whitespace (a tab or newline inside "//" is stripped by URL parsers),
// absolute and javascript: URLs, and percent-encoded variants of those.
export function isSafeNext(next) {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return false;
  if (!next.startsWith('/') || next.startsWith('//')) return false;
  if (/[\\\u0000- \u007f-\u009f]/.test(next)) return false;
  let decoded = next;
  for (let i = 0; i < 3; i += 1) {
    let step;
    try { step = decodeURIComponent(decoded); } catch { return false; }
    if (step === decoded) break;
    decoded = step;
    // A space may legitimately be encoded (%20); control characters and backslashes may not.
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f-\u009f]/.test(decoded)) return false;
  }
  try {
    const base = 'http://k710.invalid';
    if (new URL(next, base).origin !== base) return false;
  } catch {
    return false;
  }
  return true;
}

export function safeNextPath(next) {
  return isSafeNext(next) ? next : '';
}

// Longest prefix first so /dashboard/form wins over a future /dashboard entry.
const NEXT_PAGES = [
  ['/dashboard/form', 'signin.next.kvkAvailability'],
  ['/forms', 'signin.next.forms'],
  ['/power-profile', 'signin.next.powerProfile'],
  ['/tools', 'signin.next.tools'],
  ['/events', 'signin.next.events'],
  ['/prep-phase-backpack', 'signin.next.prep'],
  ['/flamedragon', 'signin.next.flamedragon'],
];

/** Catalog key for the "Sign in to open ..." banner; never the raw path. */
export function nextPageKey(next) {
  const path = pathOnly(next);
  for (const [prefix, key] of NEXT_PAGES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return 'signin.next.other';
}
