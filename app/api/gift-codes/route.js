import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getGiftSourceStatuses } from '../../../lib/giftCodeDiscovery.mjs';
import {
  getMemberGiftStatus,
  enrollMemberForGiftCodes,
  confirmMemberRedemption,
  MEMBER_CONFIRM_RESULTS,
} from '../../../lib/giftCodes.mjs';

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

export async function GET(request) {
  try {
    const session = await readMemberSession(request);
    const memberId = session?.memberId;
    if (!memberId) {
      return noStoreJson({ error: 'Sign in required.' }, { status: 401 });
    }
    const status = await getMemberGiftStatus(memberId);
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

    const enabled = Boolean(body?.enabled);
    if (enabled) {
      await enrollMemberForGiftCodes(memberId, memberId, 710);
    }
    // Disable is a no-op on Mongo test stack (no enrollments collection wired).

    const status = await getMemberGiftStatus(memberId);
    return noStoreJson({ ok: true, ...status });
  } catch (error) {
    console.error('gift-codes PATCH failed', error);
    return noStoreJson({ error: 'Unable to update gift code preference.' }, { status: 500 });
  }
}

export async function POST(request) {
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

    const redemptionId = String(body?.redemptionId || '').trim();
    const result = String(body?.result || '').trim();
    if (!redemptionId || !MEMBER_CONFIRM_RESULTS.has(result)) {
      return noStoreJson({ error: 'Invalid confirmation.' }, { status: 400 });
    }

    await confirmMemberRedemption({ memberId, redemptionId, result });
    const status = await getMemberGiftStatus(memberId);
    return noStoreJson({ ok: true, ...status });
  } catch (error) {
    console.error('gift-codes POST failed', error);
    return noStoreJson({ error: 'Unable to update redemption.' }, { status: 500 });
  }
}
