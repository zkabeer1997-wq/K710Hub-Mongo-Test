import { NextResponse } from 'next/server';
import { getToolImageMap } from '../../../lib/toolImages.server';

export const dynamic = 'force-dynamic';

// Public: { images: { <tool_key>: { url, alt } } }. Same-origin urls only; {} when nothing is set or the database is down.
export async function GET() {
  return NextResponse.json({ images: await getToolImageMap() }, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } });
}
