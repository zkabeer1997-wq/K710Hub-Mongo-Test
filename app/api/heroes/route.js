import { NextResponse } from 'next/server';
import { getPublicHeroes } from '../../../lib/heroCatalog.server.js';

// Public read of the heroes offered on the KvK Availability and Flamedragon forms.
// No Drive ids: images are same-origin /api/site-image/<id> URLs. Fails open to the built-in list.
export async function GET() {
  const heroes = await getPublicHeroes();
  return NextResponse.json({ heroes }, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } });
}
