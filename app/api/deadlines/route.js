import { NextResponse } from 'next/server';
import { getDeadlineEntries } from '../../../lib/memberFormStatus.server.js';
import { selectTickerItems } from '../../../lib/deadlines.mjs';

// Public: the next dated events/deadlines for the site-wide ticker. Event dates
// that come from the built-in defaults are flagged `estimated` so the UI never
// presents them as official.
export async function GET() {
  const now = Date.now();
  try {
    const items = selectTickerItems(await getDeadlineEntries(now), now, 3);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
  } catch (error) {
    console.error('deadlines unavailable', error);
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
