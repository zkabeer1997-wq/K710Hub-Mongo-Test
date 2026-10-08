import { NextResponse } from 'next/server';
import { refreshGiftCodes } from '../../../../lib/giftCodeDiscovery.mjs';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Daily gift code check against kingshot.net (primary) and, if the owner enabled it,
 * kingshotmastery.com - see lib/giftCodeDiscovery.mjs. Each source is attempted at most
 * once per 30 minutes; failures never remove codes. There is no automated redemption step.
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
    return noStoreJson({ ok: true, discovery });
  } catch (error) {
    console.error('gift-codes cron failed', error);
    return noStoreJson({ error: 'Cron failed' }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
