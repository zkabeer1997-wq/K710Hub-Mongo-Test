import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getStore } from '../../../lib/external/index.mjs';
import { SNAPSHOT_KEYS, PAGES } from '../../../lib/external/sources.mjs';
import { cleanText, toInt, toNum } from '../../../lib/external/sanitize.mjs';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Manual override for the figures no public page lets us read automatically
 * (KS Atlas is client-rendered and its data API is disallowed for robots).
 * GET -> current override + snapshot ages. POST { atlas: { rank, score, tier, topPercent, asOf } }.
 */
export async function GET(request) {
  if (!(await isAdminRequest(request))) return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  const store = getStore();
  const snaps = {};
  for (const [name, key] of Object.entries(SNAPSHOT_KEYS)) {
    const s = await store.read(key).catch(() => null);
    snaps[name] = s ? { fetched_at: s.fetchedAt, last_attempt_at: s.lastAttemptAt, last_error: s.lastError } : null;
  }
  const override = (await store.read(SNAPSHOT_KEYS.override).catch(() => null))?.payload || null;
  return noStoreJson({ ok: true, override, snapshots: snaps });
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }
  const a = body?.atlas;
  if (a === null) {
    await getStore().write(SNAPSHOT_KEYS.override, { sourceUrl: PAGES.atlas, payload: {} });
    return noStoreJson({ ok: true, override: {} });
  }
  if (!a || typeof a !== 'object') return noStoreJson({ error: 'Provide { atlas: {...} } or { atlas: null } to clear.' }, { status: 400 });
  const atlas = {
    rank: toInt(a.rank, { min: 1, max: 100000 }),
    score: toNum(a.score, { min: 0, max: 1000 }),
    tier: cleanText(a.tier, 20) || null,
    topPercent: cleanText(a.topPercent, 10) || null,
    asOf: cleanText(a.asOf, 40) || new Date().toISOString().slice(0, 10),
  };
  if (atlas.rank === null && atlas.score === null) return noStoreJson({ error: 'rank or score is required.' }, { status: 400 });
  await getStore().write(SNAPSHOT_KEYS.override, { sourceUrl: PAGES.atlas, payload: { atlas } });
  return noStoreJson({ ok: true, override: { atlas } });
}
