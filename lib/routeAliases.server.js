import 'server-only';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { ALIAS_CACHE_MS, buildAliasMap } from './routeAliases.mjs';

// In-process cache of the alias map. Reads fail OPEN: if Mongo is
// unreachable the site simply works with no aliases.
const state = globalThis.__k710RouteAliases || (globalThis.__k710RouteAliases = { map: {}, at: 0, inflight: null });

export function invalidateRouteAliases() {
  state.at = 0;
  state.inflight = null;
}

export async function listRouteAliasRows() {
  const coll = await getCollection(COLLECTIONS.ROUTE_ALIASES);
  const rows = await coll.find({}).project({ _id: 0 }).toArray();
  return rows;
}

export async function getRouteAliasMap() {
  if (Date.now() - state.at < ALIAS_CACHE_MS) return state.map;
  if (state.inflight) return state.inflight;
  state.inflight = (async () => {
    try {
      state.map = buildAliasMap(await listRouteAliasRows());
    } catch {
      state.map = {};
    }
    state.at = Date.now();
    state.inflight = null;
    return state.map;
  })();
  return state.inflight;
}
