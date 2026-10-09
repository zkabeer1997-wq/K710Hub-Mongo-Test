// Request handling for POST /api/translate, kept out of the route file so tests can call it with
// injected dependencies (fakeMongo, a mocked fetch, a fixed clock) and no Next runtime.
import { isSameOriginRequest } from '../sameOrigin.js';
import { checkRateLimit, clientIp } from '../rateLimit.mjs';
import { resolveEndpoint } from './catalogTools.mjs';
import { translateUnits, validateRequest } from './serverTranslate.mjs';

export const RATE_LIMIT = Object.freeze({ windowMs: 60_000, max: 40 });

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

/** The page never needs an error from this route: every failure that is not the caller's fault is a plain 200 "unavailable". */
export async function handleTranslate(request, deps) {
  const {
    glossary, getCollection, fetchImpl = fetch, env = process.env, now = Date.now(), rateLimit = checkRateLimit,
  } = deps;
  // Same-origin only. Browsers always send Origin on a fetch POST; a request with neither header is not our page.
  const site = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  const hasOrigin = Boolean(request.headers.get('origin'));
  if (!isSameOriginRequest(request) || (!hasOrigin && site !== 'same-origin')) {
    return json({ ok: false, error: 'Translation requests must come from this site.' }, 403);
  }
  const max = Number(env.TRANSLATE_RATE_MAX) > 0 ? Number(env.TRANSLATE_RATE_MAX) : RATE_LIMIT.max;
  if (await rateLimit(`translate:${clientIp(request)}`, { ...RATE_LIMIT, max, failOpen: true })) {
    return json({ ok: false, error: 'Too many translation requests. Try again in a minute.' }, 429, { 'Retry-After': '60' });
  }
  let body;
  try { body = await request.json(); } catch { body = null; }
  const valid = validateRequest(body);
  if (valid.error) return json({ ok: false, error: valid.error }, 400);

  const apiKey = env.GOOGLE_TRANSLATE_API_KEY || '';
  try {
    const result = await translateUnits({
      lang: valid.lang,
      strings: valid.strings,
      glossary,
      getCollection,
      fetchImpl,
      apiKey,
      endpoint: resolveEndpoint(env),
      now,
      budget: Number.isFinite(Number(env.TRANSLATE_DAILY_CHAR_BUDGET)) && env.TRANSLATE_DAILY_CHAR_BUDGET !== undefined && env.TRANSLATE_DAILY_CHAR_BUDGET !== '' ? Number(env.TRANSLATE_DAILY_CHAR_BUDGET) : undefined,
    });
    if (result.stats.error) console.error('translate: provider error', result.stats.httpStatus || '', result.stats.error);
    return json({ ok: true, lang: valid.lang, engine: result.engine, status: result.status, translations: result.translations });
  } catch (error) {
    console.error('translate: unexpected failure', String(error?.message || error).slice(0, 200));
    return json({ ok: true, lang: valid.lang, engine: 'none', status: 'unavailable', translations: valid.strings.map(() => null) });
  }
}
