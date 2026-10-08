/**
 * CSRF / cross-site request defense for cookie-authenticated API routes.
 *
 * Edge-safe (no node: imports, only Web APIs) because proxy.js enforces it
 * centrally for every state-changing /api request.
 *
 * Policy: a browser always sends `Sec-Fetch-Site` and, for non-GET requests,
 * `Origin`. We reject a request when
 *   - Sec-Fetch-Site is `cross-site` or `same-site` (a sibling subdomain is not us), or
 *   - an Origin header is present and its host differs from the request host.
 * Requests with neither header (curl, server-to-server, cron, tests) are not
 * browser-driven, so they cannot be a CSRF vector and are allowed; they still
 * need their own credentials. `Sec-Fetch-Site: none` (user-initiated) is allowed.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function headerValue(request, name) {
  const headers = request?.headers;
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name] || '';
}

/** True when the request method can change state. */
export function isStateChangingMethod(method) {
  return !SAFE_METHODS.has(String(method || 'GET').toUpperCase());
}

/**
 * @param {Request} request
 * @returns {boolean} true when the request is acceptable (same-origin or non-browser)
 */
export function isSameOriginRequest(request) {
  const site = headerValue(request, 'sec-fetch-site').toLowerCase();
  if (site === 'cross-site' || site === 'same-site') return false;

  const origin = headerValue(request, 'origin');
  if (!origin) return true;
  if (origin === 'null') return false;

  const hosts = [headerValue(request, 'x-forwarded-host'), headerValue(request, 'host')]
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return hosts.includes(originHost);
  } catch {
    return false;
  }
}

/**
 * Guard for mutating requests. Returns a 403 Response to send, or null to continue.
 * Safe methods and public cron endpoints (Bearer secret, no cookies) are exempt.
 */
export function rejectCrossOriginMutation(request, pathname) {
  if (!isStateChangingMethod(request?.method)) return null;
  if (typeof pathname === 'string' && (pathname === '/api/cron' || pathname.startsWith('/api/cron/'))) {
    return null;
  }
  if (isSameOriginRequest(request)) return null;
  return new Response(JSON.stringify({ error: 'Cross-origin requests are not allowed.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
