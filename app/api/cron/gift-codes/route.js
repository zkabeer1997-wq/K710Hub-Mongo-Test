import { NextResponse } from 'next/server';
import { refreshGiftCodes } from '../../../../lib/giftCodeDiscovery.mjs';
import { getDb } from '../../../../lib/mongo';
import { createMongoStore } from '../../../../lib/giftRedeem/mongoStore.mjs';
import { runAndChain, selfOrigin } from '../../../../lib/giftRedeem/run.mjs';
import { runInBackground } from '../../../../lib/giftRedeem/background.js';

// The redeem run started after discovery works inside GIFT_REDEEM_BUDGET_MS and chains itself.
export const maxDuration = 300;

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Daily gift code check against kingshot.net (primary) and, if the owner enabled it,
 * kingshotmastery.com - see lib/giftCodeDiscovery.mjs. Each source is attempted at most
 * once per 30 minutes; failures never remove codes. After discovery the redeem runner is started
 * (it only does anything when an admin switched automatic redeeming on and GIFT_REDEEM_SIGN_SECRET is set).
 * Secured with CRON_SECRET (Vercel Cron sends it as a Bearer token).
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  // x-vercel-cron is just a plain request header, not a signed one - any
  // caller can set it. Require the bearer token to actually match
  // CRON_SECRET (which Vercel Cron sends as Authorization: Bearer <secret>
  // when CRON_SECRET is configured on the project).
  const isCron = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const discovery = await refreshGiftCodes();
    const origin = selfOrigin(request);
    // Also resumes unfinished work, so this daily call doubles as a safety net for the chained runs.
    runInBackground(async () => runAndChain({ store: createMongoStore(await getDb()), origin, depth: 0 }));
    return noStoreJson({ ok: true, discovery });
  } catch (error) {
    console.error('gift-codes cron failed', error);
    return noStoreJson({ error: 'Cron failed' }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
