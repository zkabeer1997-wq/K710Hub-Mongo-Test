import { ExternalError } from './sanitize.mjs';
import { ALLOWED_HOSTS, FETCH_TIMEOUT_MS, userAgent } from './sources.mjs';
import { isAllowed, parseRobots } from './robots.mjs';

const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 3_000_000;
const robotsCache = new Map(); // host -> { at, groups }

export function resetRobotsCache() {
  robotsCache.clear();
}

function assertAllowedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new ExternalError('host', 'Invalid URL');
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname) || u.username || u.password) {
    throw new ExternalError('host', `Host not allowed: ${u.hostname}`);
  }
  return u;
}

async function rawFetch(url, { method = 'GET', body, headers = {}, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method,
      body,
      headers: { 'User-Agent': userAgent(), Accept: 'application/json, text/html;q=0.8', ...headers },
      redirect: 'manual',
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new ExternalError('timeout', 'Request timed out');
    throw new ExternalError('network', error?.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res) {
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new ExternalError('size', 'Response too large');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new ExternalError('size', 'Response too large');
  return text;
}

async function robotsFor(host, { fetchImpl, timeoutMs, now }) {
  const hit = robotsCache.get(host);
  if (hit && now - hit.at < ROBOTS_TTL_MS) return hit.groups;
  let groups = [];
  try {
    const res = await rawFetch(`https://${host}/robots.txt`, { fetchImpl, timeoutMs });
    // 4xx: no robots file, everything allowed. 5xx / network: be conservative and skip this run.
    if (res.status >= 500) throw new ExternalError('robots', `robots.txt unavailable (${res.status})`);
    if (res.status === 200) groups = parseRobots(await readCapped(res));
  } catch (error) {
    if (error instanceof ExternalError && error.code === 'robots') throw error;
    throw new ExternalError('robots', 'robots.txt could not be checked');
  }
  robotsCache.set(host, { at: now, groups });
  return groups;
}

/**
 * Fetch a fixed, allow-listed https URL politely: robots.txt is obeyed, 8s timeout,
 * size cap, redirects only to allow-listed hosts (max 3), clear User-Agent.
 * Returns { status, text }. Never follows user input: callers pass constants.
 */
export async function fetchExternal(url, { method = 'GET', json, fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS, now = Date.now() } = {}) {
  let current = url;
  for (let hop = 0; hop <= 3; hop += 1) {
    const u = assertAllowedUrl(current);
    const groups = await robotsFor(u.hostname, { fetchImpl, timeoutMs, now });
    if (!isAllowed(groups, `${u.pathname}${u.search}`)) {
      throw new ExternalError('robots', `robots.txt disallows ${u.pathname}`);
    }
    const res = await rawFetch(current, {
      method,
      fetchImpl,
      timeoutMs,
      body: json === undefined ? undefined : JSON.stringify(json),
      headers: json === undefined ? {} : { 'Content-Type': 'application/json' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) throw new ExternalError('http', `Redirect without location (${res.status})`);
      current = new URL(loc, current).href;
      // 301/302/303 redirects re-issue as GET; 307/308 keep the method (fine for our fixed targets).
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      // Blocked or rate limited: report, never work around it.
      throw new ExternalError('http', `Source refused automated access (${res.status})`);
    }
    if (res.status < 200 || res.status >= 300) throw new ExternalError('http', `HTTP ${res.status}`);
    return { status: res.status, text: await readCapped(res) };
  }
  throw new ExternalError('http', 'Too many redirects');
}

export async function fetchJson(url, opts = {}) {
  const { text } = await fetchExternal(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new ExternalError('shape', 'Response was not JSON');
  }
}
