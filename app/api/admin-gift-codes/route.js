import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { readMemberSession } from '../../../lib/memberAuth';
import { getCollection, getDb } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { addManualCodes, getGiftSourceStatuses, parseCodeList, refreshGiftCodes } from '../../../lib/giftCodeDiscovery.mjs';
import { createMongoStore } from '../../../lib/giftRedeem/mongoStore.mjs';
import { adminOverview, applyAdminAction, pageParams } from '../../../lib/giftRedeem/service.mjs';
import { MAX_BODY_CHARS, normalizeKingdom } from '../../../lib/giftRedeem/players.mjs';
import { requestNextRun, selfOrigin } from '../../../lib/giftRedeem/run.mjs';
import { runInBackground } from '../../../lib/giftRedeem/background.js';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Who did it, for the audit trail: the signed-in elevated member, else the shared admin login. */
async function actorOf(request) {
  try {
    const session = await readMemberSession(request);
    if (session?.memberId && session.role !== 'member') return `${session.role}:${session.memberId}`;
  } catch { /* fall through */ }
  return 'admin';
}

/** Actions that can create new work for the runner: start a run afterwards (cheap self-call, 202). */
const KICK_ACTIONS = new Set(['add_code', 'add_codes', 'add_players', 'import_players', 'set_code_active', 'reprocess_code', 'set_player_enabled', 'reenable_player', 'set_auto_redeem']);

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const store = createMongoStore(await getDb());
    const params = new URL(request.url || '', 'http://localhost').searchParams;
    const view = params.get('view') || 'overview';

    if (view === 'players') {
      const { page, limit, skip } = pageParams(params);
      const flag = (name) => (params.get(name) === 'yes' ? true : params.get(name) === 'no' ? false : undefined);
      const source = ['member', 'admin', 'bot_import'].includes(params.get('source')) ? params.get('source') : undefined;
      const res = await store.listPlayers({
        enabled: flag('enabled'), failed: flag('failed'), source,
        kingdom: normalizeKingdom(params.get('kingdom')) || undefined,
        q: (params.get('q') || '').replace(/\D/g, '').slice(0, 20) || undefined,
        skip, limit,
      });
      return noStoreJson({ ok: true, page, limit, ...res });
    }

    if (view === 'history') {
      const { page, limit, skip } = pageParams(params);
      const res = await store.searchRedemptions({ q: (params.get('q') || '').trim().slice(0, 40), skip, limit });
      return noStoreJson({ ok: true, page, limit, ...res });
    }

    const overview = await adminOverview(store);
    return noStoreJson({
      ok: true,
      ...overview,
      activeCount: overview.codes.filter((c) => c.active !== false).length,
      totalCount: overview.codes.length,
      sources: await getGiftSourceStatuses(),
      audit: await store.listAudit(15),
    });
  } catch (error) {
    console.error('admin-gift-codes GET failed', error);
    return noStoreJson({ error: 'Unable to load gift codes.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    if (Number(request.headers.get('content-length')) > MAX_BODY_CHARS) return noStoreJson({ error: 'Request too large.' }, { status: 413 });
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const action = String(body?.action || '').trim();
  const origin = selfOrigin(request);
  const kick = () => {
    if (KICK_ACTIONS.has(action)) runInBackground(() => requestNextRun({ origin, depth: 0 }));
  };

  try {
    const store = createMongoStore(await getDb());
    const actor = await actorOf(request);

    if (action === 'check_sources' || action === 'check_wiki') {
      // Respects the 30 minute per-source claim unless the admin explicitly forces it.
      const coll = await getCollection(COLLECTIONS.GIFT_CODES);
      const discovery = await refreshGiftCodes({ force: body?.force === true, coll });
      if (discovery.new_codes > 0) runInBackground(() => requestNextRun({ origin, depth: 0 }));
      return noStoreJson({ ok: true, discovery, sources: await getGiftSourceStatuses() });
    }

    if (action === 'add_code' || action === 'add_codes') {
      const coll = await getCollection(COLLECTIONS.GIFT_CODES);
      const { valid, rejected } = parseCodeList(action === 'add_code' ? body?.code : body?.text);
      if (!valid.length) {
        return noStoreJson({ error: 'No valid codes found. Codes are letters and digits only, 4 to 32 characters.', rejected }, { status: 400 });
      }
      if (action === 'add_code' && (valid.length !== 1 || rejected.length)) {
        return noStoreJson({ error: 'Invalid code. Use letters and digits only, 4 to 32 characters.' }, { status: 400 });
      }
      const result = await addManualCodes(coll, valid, { notes: typeof body?.notes === 'string' ? body.notes.slice(0, 200) : null });
      await store.addAudit({ at: new Date(), actor, action: 'add_codes', target: `${valid.length} code(s)`, detail: `added ${result.added}, re-enabled ${result.reactivated}, already had ${result.already}` });
      kick();
      return noStoreJson({ ok: true, code: valid[0], ...result, rejected });
    }

    const res = await applyAdminAction(store, action, body, { actor });
    if (res.status === 200) kick();
    return noStoreJson(res.body, { status: res.status });
  } catch (error) {
    console.error('admin-gift-codes POST failed', error);
    return noStoreJson({ error: 'Action failed.' }, { status: 500 });
  }
}
