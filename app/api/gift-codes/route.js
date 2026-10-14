import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getDb } from '../../../lib/mongo';
import { getGiftSourceStatuses } from '../../../lib/giftCodeDiscovery.mjs';
import { createMongoStore } from '../../../lib/giftRedeem/mongoStore.mjs';
import { memberStatus, setMemberOptIn } from '../../../lib/giftRedeem/service.mjs';
import { requestNextRun, selfOrigin } from '../../../lib/giftRedeem/run.mjs';
import { runInBackground } from '../../../lib/giftRedeem/background.js';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Cheap, read-only hint ("kingshot.net, checked <iso>"). Never fetches; null on any problem. */
async function memberSourceHint() {
  try {
    const ok = (await getGiftSourceStatuses())
      .filter((s) => s.enabled && s.last_ok_at)
      .sort((a, b) => b.last_ok_at.localeCompare(a.last_ok_at))[0];
    return ok ? { source: ok.label, url: ok.url, checked_at: ok.last_ok_at } : null;
  } catch {
    return null;
  }
}

// Member view: only the signed-in member's own opt-in and results. The player ID always comes from
// the session, Kingdom is always 710, and nothing about other players is ever returned.
export async function GET(request) {
  try {
    const session = await readMemberSession(request);
    const memberId = session?.memberId;
    if (!memberId) {
      return noStoreJson({ error: 'Sign in required.' }, { status: 401 });
    }
    const store = createMongoStore(await getDb());
    const status = await memberStatus(store, memberId);
    return noStoreJson({ ok: true, ...status, codeSource: await memberSourceHint() });
  } catch (error) {
    console.error('gift-codes GET failed', error);
    return noStoreJson({ error: 'Unable to load gift code status.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await readMemberSession(request);
    const memberId = session?.memberId;
    if (!memberId) {
      return noStoreJson({ error: 'Sign in required.' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
    }
    if (typeof body?.enabled !== 'boolean') {
      return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
    }

    const store = createMongoStore(await getDb());
    const res = await setMemberOptIn(store, memberId, body.enabled);
    if (!res.ok) return noStoreJson({ error: res.error }, { status: 400 });
    if (body.enabled) {
      const origin = selfOrigin(request);
      runInBackground(() => requestNextRun({ origin, depth: 0 }));
    }
    const status = await memberStatus(store, memberId);
    return noStoreJson({ ok: true, ...status });
  } catch (error) {
    console.error('gift-codes PATCH failed', error);
    return noStoreJson({ error: 'Unable to update gift code preference.' }, { status: 500 });
  }
}
