import { ExternalError, cleanText, isPlainObject, isoDate, toInt, toNum } from './sanitize.mjs';

const RESULT = new Set(['W', 'L']);
const MAX_HISTORY = 60;

/** Kingdom page JSON: { success, result: { id, history[], rating_history[], rating_history_time[] } }. */
export function parseKingdomResponse(json) {
  const r = isPlainObject(json) ? json.result : null;
  if (!isPlainObject(json) || json.success === false || !isPlainObject(r) || !Array.isArray(r.history)) {
    throw new ExternalError('shape', 'Kingdom response has an unexpected shape');
  }
  const history = [];
  for (const h of r.history.slice(-MAX_HISTORY)) {
    if (!isPlainObject(h)) continue;
    const kvk = toInt(h.kvk, { min: 1, max: 9999 });
    const opponent = toInt(h.opponent, { min: 1, max: 99999 });
    if (kvk === null || opponent === null) continue;
    const prep = RESULT.has(h.prep) ? h.prep : null;
    const battle = RESULT.has(h.battle) ? h.battle : null;
    if (!prep && !battle) continue;
    history.push({ kvk, date: isoDate(h.date), opponent, prep, battle });
  }
  history.sort((a, b) => a.kvk - b.kvk);
  if (history.length === 0) throw new ExternalError('shape', 'Kingdom response had no usable KvK history');

  const rating = (arr) => {
    const last = Array.isArray(arr) ? arr.filter(isPlainObject).at(-1) : null;
    if (!last) return null;
    return {
      kvk: toInt(last.kvk, { min: 1, max: 9999 }),
      rating: toNum(last.rating, { min: 0, max: 100 }),
      rank: toInt(last.rank, { min: 1, max: 100000 }),
      rankPrep: toInt(last.rank_prep, { min: 1, max: 100000 }),
      rankBattle: toInt(last.rank_battle, { min: 1, max: 100000 }),
    };
  };
  return {
    id: toInt(r.id, { min: 1, max: 99999 }),
    history,
    // "time" = the default, time-decayed ranking the Optimizer's table shows; "static" ignores recency.
    ratingTime: rating(r.rating_history_time),
    ratingStatic: rating(r.rating_history),
  };
}

/** Featured-matchups JSON: we only need its metadata (field size, KvK count/dates). */
export function parseMatchupsResponse(json) {
  const r = isPlainObject(json) ? json.result : null;
  const meta = isPlainObject(r) ? r.metadata : null;
  if (!isPlainObject(json) || json.success === false || !isPlainObject(meta)) {
    throw new ExternalError('shape', 'Matchups response has an unexpected shape');
  }
  const totalKingdoms = toInt(meta.total_kingdoms, { min: 1, max: 1_000_000 });
  const totalKvks = toInt(meta.total_kvks, { min: 1, max: 9999 });
  if (totalKingdoms === null && totalKvks === null) throw new ExternalError('shape', 'Matchups metadata is empty');
  const kvkDates = {};
  if (isPlainObject(meta.kvk_dates)) {
    for (const [k, v] of Object.entries(meta.kvk_dates).slice(0, 200)) {
      const n = toInt(k, { min: 1, max: 9999 });
      const d = isoDate(v);
      if (n !== null && d) kvkDates[n] = d;
    }
  }
  return {
    totalKingdoms,
    totalKvks,
    generatedAt: cleanText(meta.generated_at, 40) || null,
    kvkDates,
  };
}
