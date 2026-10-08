import { OPTIMIZER_RECORD, ATLAS_RANKING, KINGDOM_DATA_AS_OF } from '../kingdomExternalData.mjs';
import { fetchExternal, fetchJson } from './http.mjs';
import { loadExternal } from './snapshotStore.mjs';
import { parseKingdomResponse, parseMatchupsResponse } from './rankingsParse.mjs';
import { parseAtlasPage } from './atlasParse.mjs';
import { PAGES, OPTIMIZER_API, SNAPSHOT_KEYS, STALE_MS } from './sources.mjs';
import { cleanText, isPlainObject, toInt, toNum } from './sanitize.mjs';

const RECENT = 8;

/** The three sources: how to fetch, how to validate, which page to credit. */
export function sourceDefs({ fetchImpl } = {}) {
  const post = (api) => () => fetchJson(api.url, { method: 'POST', json: api.body, fetchImpl });
  return {
    kingdom: { key: SNAPSHOT_KEYS.kingdom, name: 'Kingshot Optimizer: KvK record', page: PAGES.kingdom, sourceUrl: OPTIMIZER_API.kingdom.url, fetcher: post(OPTIMIZER_API.kingdom), parse: parseKingdomResponse },
    matchups: { key: SNAPSHOT_KEYS.matchups, name: 'Kingshot Optimizer: matchups', page: PAGES.matchups, sourceUrl: OPTIMIZER_API.matchups.url, fetcher: post(OPTIMIZER_API.matchups), parse: parseMatchupsResponse },
    atlas: { key: SNAPSHOT_KEYS.atlas, name: 'Kingshot Atlas', page: PAGES.atlas, sourceUrl: PAGES.atlas, fetcher: async () => (await fetchExternal(PAGES.atlas, { fetchImpl })).text, parse: parseAtlasPage },
  };
}

function streakOf(results) {
  if (!results.length) return null;
  const type = results.at(-1);
  let count = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === type; i -= 1) count += 1;
  return { type, count };
}

function tally(list) {
  const clean = list.filter(Boolean);
  return { wins: clean.filter((r) => r === 'W').length, losses: clean.filter((r) => r === 'L').length };
}

/** Pure: turn parsed (validated) source payloads into the shape the site renders. */
export function normalizeKvkRecord({ kingdom, matchups, atlas, override, fetchedAt = {}, status = {}, now = Date.now() }) {
  const sources = [];
  const addSource = (id, def, payload) => {
    const at = fetchedAt[id] ? new Date(fetchedAt[id]) : null;
    sources.push({
      name: def.name,
      url: def.page,
      fetched_at: at ? at.toISOString() : null,
      status: payload ? (status[id] === 'snapshot' ? 'snapshot' : 'live') : 'unavailable',
    });
  };
  const defs = sourceDefs();
  addSource('kingdom', defs.kingdom, kingdom);
  addSource('matchups', defs.matchups, matchups);
  addSource('atlas', defs.atlas, atlas && atlas.available ? atlas : null);

  let record = null;
  let ranking = null;
  let matchupList = [];
  if (kingdom) {
    const prep = tally(kingdom.history.map((h) => h.prep));
    const battle = tally(kingdom.history.map((h) => h.battle));
    record = {
      wins: battle.wins,
      losses: battle.losses,
      streak: streakOf(kingdom.history.map((h) => h.battle).filter(Boolean)),
      battle,
      prep,
      kvks: kingdom.history.length,
    };
    const t = kingdom.ratingTime || kingdom.ratingStatic;
    ranking = {
      rank: t?.rank ?? null,
      rating: t?.rating ?? null,
      of: matchups?.totalKingdoms ?? null,
      asOfKvk: t?.kvk ?? null,
      battleRank: t?.rankBattle ?? null,
      prepRank: t?.rankPrep ?? null,
      static: kingdom.ratingStatic ? { rank: kingdom.ratingStatic.rank, rating: kingdom.ratingStatic.rating } : null,
    };
    matchupList = [...kingdom.history].reverse().slice(0, RECENT).map((h) => ({
      kvkNumber: h.kvk,
      opponent: h.opponent,
      result: h.battle === 'W' ? 'win' : h.battle === 'L' ? 'loss' : null,
      prep: h.prep === 'W' ? 'win' : h.prep === 'L' ? 'loss' : null,
      date: h.date,
    }));
  }

  // Atlas: live page data if the page ever carries it, else a manual override, else the dated default.
  const ov = isPlainObject(override?.atlas) ? override.atlas : null;
  let atlasOut;
  if (atlas?.available) {
    atlasOut = { rank: atlas.rank, score: atlas.score, tier: atlas.tier, topPercent: atlas.topPercent, origin: 'live', asOf: fetchedAt.atlas ? new Date(fetchedAt.atlas).toISOString() : null, url: PAGES.atlas };
  } else if (ov) {
    atlasOut = {
      rank: toInt(ov.rank, { min: 1, max: 100000 }),
      score: toNum(ov.score, { min: 0, max: 1000 }),
      tier: cleanText(ov.tier, 20) || null,
      topPercent: cleanText(ov.topPercent, 10) || null,
      origin: 'manual',
      asOf: cleanText(ov.asOf, 40) || null,
      url: PAGES.atlas,
    };
  } else {
    atlasOut = { rank: ATLAS_RANKING.rank, score: ATLAS_RANKING.atlasScore, tier: ATLAS_RANKING.tier, topPercent: ATLAS_RANKING.topPercent, origin: 'default', asOf: KINGDOM_DATA_AS_OF, url: PAGES.atlas };
  }

  let isDefault = false;
  if (!record) {
    // Last resort only: the hand-typed numbers in lib/kingdomExternalData.mjs.
    isDefault = true;
    record = { wins: OPTIMIZER_RECORD.battle.wins, losses: OPTIMIZER_RECORD.battle.losses, streak: null, battle: OPTIMIZER_RECORD.battle, prep: OPTIMIZER_RECORD.prep, kvks: OPTIMIZER_RECORD.kvksParticipated };
    ranking = { rank: OPTIMIZER_RECORD.rank, rating: OPTIMIZER_RECORD.rating, of: null, asOfKvk: null, battleRank: null, prepRank: null, static: null };
  }

  const oldest = ['kingdom', 'matchups'].map((id) => fetchedAt[id]).filter(Boolean).map((d) => new Date(d).getTime());
  const updatedAt = oldest.length ? new Date(Math.min(...oldest)).toISOString() : null;
  const stale = isDefault || !updatedAt || now - new Date(updatedAt).getTime() > STALE_MS;
  return { record, ranking, matchups: matchupList, atlas: atlasOut, sources, stale, isDefault, updatedAt, defaultAsOf: isDefault ? KINGDOM_DATA_AS_OF : null };
}

/**
 * Load all three sources (each independent: one failing never hides the others),
 * with Mongo snapshots, then normalize. Pass `store` (createSnapshotStore).
 */
export async function loadKvkRecord({ store, fetchImpl, now = Date.now(), allowFetch = true } = {}) {
  const defs = sourceDefs({ fetchImpl });
  const common = { store, now, allowFetch };
  const [kingdom, matchups, atlas, override] = await Promise.all([
    loadExternal({ ...common, ...defs.kingdom }),
    loadExternal({ ...common, ...defs.matchups }),
    loadExternal({ ...common, ...defs.atlas }),
    store.read(SNAPSHOT_KEYS.override).catch(() => null),
  ]);
  return normalizeKvkRecord({
    kingdom: kingdom.payload,
    matchups: matchups.payload,
    atlas: atlas.payload,
    override: override?.payload || null,
    fetchedAt: { kingdom: kingdom.fetchedAt, matchups: matchups.fetchedAt, atlas: atlas.fetchedAt },
    status: { kingdom: kingdom.status, matchups: matchups.status, atlas: atlas.status },
    now,
  });
}
