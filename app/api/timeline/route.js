import { NextResponse } from 'next/server';
import { getTimeline } from '../../../lib/external/index.mjs';
import { buildChapters } from '../../../lib/external/timelineProgress.mjs';

/** Public JSON of the kingdom 710 timeline (snapshot-backed; never blocks on the source for long). */
export async function GET() {
  const t = await getTimeline();
  const response = NextResponse.json({
    kingdom: t.kingdom,
    available: t.available,
    createdDate: t.createdDate,
    fetchedAt: t.fetchedAt,
    stale: t.stale,
    source: { name: 'Kingshot Optimizer', url: t.sourceUrl },
    chapters: buildChapters(t.milestones).map(({ date, items }) => ({ date, items: items.map(({ slug, title, category }) => ({ slug, title, category })) })),
  });
  response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  return response;
}
