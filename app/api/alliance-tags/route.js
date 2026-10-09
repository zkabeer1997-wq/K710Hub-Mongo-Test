import { NextResponse } from 'next/server';
import { loadActiveAllianceSummaries } from '../../../lib/allianceTags.server';
import { LEGACY_ALLIANCE_TAGS } from '../../../lib/alliances.mjs';

// Public: active alliance tags and Bear Hunt times, for the forms' dropdowns.
// If the database cannot be read the original three are returned, never an error.
export async function GET() {
  const rows = await loadActiveAllianceSummaries();
  const alliances = rows.length
    ? rows.map((r) => ({ tag: String(r.tag), name: String(r.name || r.tag), bear_times_utc: Array.isArray(r.bear_times_utc) ? r.bear_times_utc : [] }))
    : LEGACY_ALLIANCE_TAGS.map((tag) => ({ tag, name: tag, bear_times_utc: [] }));
  return NextResponse.json({ alliances }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
