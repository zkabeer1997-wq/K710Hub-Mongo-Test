import { validateAllianceEvents } from '../../../lib/allianceEvents.mjs';
import { NextResponse } from 'next/server';
import { revalidateAlliancePages } from '../../../lib/revalidateAlliancePages';
import { validateBearTimes } from '../../../lib/bearHuntSchedule';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

const STATUSES = ['open', 'selective', 'closed'];
const TAG_RE = /^[A-Z0-9]{2,10}$/;

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const data = await coll.find({}).sort({ sort_order: 1 }).toArray();
    // strip Mongo _id for cleaner JSON
    const alliances = (data || []).map(({ _id, ...rest }) => rest);
    return NextResponse.json({ alliances });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const tag = String(body.tag || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const recruitingStatus = String(body.recruiting_status || 'open').trim();

  if (!TAG_RE.test(tag)) {
    return NextResponse.json({ error: 'Tag must be 2-10 uppercase letters/numbers.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  if (!STATUSES.includes(recruitingStatus)) {
    return NextResponse.json({ error: 'Unsupported recruiting status.' }, { status: 400 });
  }

  const { events, error: eventError } = validateAllianceEvents(body.scheduled_events ?? []);
  if (eventError) return NextResponse.json({ error: eventError }, { status: 400 });

  const { times, error: timeError } = validateBearTimes(body.bear_times_utc ?? []);
  if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });

  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const doc = {
      bear_times_utc: times,
      scheduled_events: events,
      tag,
      name,
      blurb: String(body.blurb || ''),
      leader_player_id: body.leader_player_id ? String(body.leader_player_id) : null,
      timezone_focus: body.timezone_focus ? String(body.timezone_focus) : null,
      recruiting_status: recruitingStatus,
      language: body.language ? String(body.language) : null,
      roster_size:
        Number.isFinite(Number(body.roster_size)) && body.roster_size !== ''
          ? Number(body.roster_size)
          : null,
      active: body.active !== false,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await coll.insertOne(doc);
    const { _id, ...alliance } = doc;

    revalidateAlliancePages(tag);

    return NextResponse.json({ alliance });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
