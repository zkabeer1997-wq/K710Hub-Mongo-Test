import { NextResponse } from 'next/server';
import { refreshAllExternal } from '../../../../lib/external/index.mjs';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Refreshes the third-party snapshots (Kingshot Optimizer timeline + KvK
 * rankings, KS Atlas) in Mongo. Each source is attempted at most once per 30
 * minutes across all instances. Secured like the gift-codes cron: the request
 * must carry `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it).
 */
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await refreshAllExternal();
    return noStoreJson({ ok: true, results });
  } catch (error) {
    console.error('refresh-external cron failed', error);
    return noStoreJson({ error: 'Cron failed' }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
