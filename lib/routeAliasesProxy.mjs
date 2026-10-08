import { ALIAS_CACHE_MS, buildAliasMap } from './routeAliases.mjs';

// Used by proxy.js. The proxy bundle must not import the Mongo driver, so it
// reads the public map from /api/route-aliases on the same origin and caches
// it in-process for ~15s. Any failure fails OPEN (no aliasing), with a short
// negative cache so a dead database is not hammered on every request.
const FAIL_CACHE_MS = 5000;
const state = globalThis.__k710ProxyAliases || (globalThis.__k710ProxyAliases = { map: {}, until: 0, inflight: null });

export function resetProxyAliasCache() {
  state.map = {};
  state.until = 0;
  state.inflight = null;
}

export async function loadProxyAliasMap(origin, fetchImpl = globalThis.fetch) {
  if (Date.now() < state.until) return state.map;
  if (state.inflight) return state.inflight;
  state.inflight = (async () => {
    try {
      const res = await fetchImpl(`${origin}/api/route-aliases`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      state.map = buildAliasMap(Object.entries(data?.aliases || {}).map(([from, to]) => ({ from, to })));
      state.until = Date.now() + ALIAS_CACHE_MS;
    } catch {
      state.map = {};
      state.until = Date.now() + FAIL_CACHE_MS;
    }
    state.inflight = null;
    return state.map;
  })();
  return state.inflight;
}
