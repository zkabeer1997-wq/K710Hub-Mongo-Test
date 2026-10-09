import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { getCurrentEventCycle, loadMemberCycleRecord, snapshotIfFromPastCycle } from '../../../lib/eventCycles.server';
import { loadMemberBase, getMemberIdentity } from '../../../lib/memberPrefill.server.js';
import { saveTroopsToProfile } from '../../../lib/troopProfile.server.js';
import { getActiveHeroNames } from '../../../lib/heroCatalog.server.js';
import { orderTroopSources, resolveTroopPrefill, sanitizeRequiredKvkTroops, troopFieldsOf } from '../../../lib/kvkAvailability.mjs';

const ALLIANCES = ['710', 'RED', 'SKY'];
const AVAILABILITY = [
  'First half (12-14:30 UTC)',
  'Second half (14:30-17 UTC)',
  'Full battle (12-17 UTC)',
  'Not Available',
];

function pickJoiner(row, heroList) {
  if (!row) return null;
  const { name, member_id, current_alliance, availability, updated_at, event_cycle_id, event_cycle_label } = row;
  return { name, member_id, current_alliance, availability, updated_at, event_cycle_id, event_cycle_label, ...troopFieldsOf(row, heroList) };
}

async function resolveSession(request) {
  try {
    const kingshot = await readKingshotSession(request);
    if (kingshot?.memberId) {
      return { memberId: kingshot.memberId, role: kingshot.role || 'member', via: 'kingshot' };
    }
  } catch {
    /* fall through */
  }
  const legacy = await readMemberSession(request);
  if (legacy?.memberId) return { ...legacy, via: 'legacy' };
  return null;
}

export async function GET(request) {
  const session = await resolveSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
    const data = await coll.findOne(
      { member_id: session.memberId },
      {
        projection: {
          name: 1,
          member_id: 1,
          current_alliance: 1,
          availability: 1,
          infantry_tier: 1, infantry_tg: 1, cavalry_tier: 1, cavalry_tg: 1, archer_tier: 1, archer_tg: 1,
          heroes: 1,
          updated_at: 1,
          _id: 0,
        },
      }
    );
    // `row` is the member's roster row (name, ID, last values) as before. `record` is the answer
    // for THIS KvK cycle (null until saved) and `previous` the latest earlier-cycle answer.
    const { cycle, record, previous } = await loadMemberCycleRecord('joiner', session.memberId);
    const [base, identity] = await Promise.all([loadMemberBase(session.memberId), getMemberIdentity(session)]);
    const heroList = await getActiveHeroNames(); // inactive heroes are dropped from what the form shows
    // Troop levels + heroes are per KvK cycle. Prefill: this cycle's answer, else the latest earlier
    // cycle's, else the old Power Profile values (where they used to be entered).
    const prefill = resolveTroopPrefill(orderTroopSources({ record, previous, profile: base.profile }), heroList);
    return NextResponse.json(
      {
        row: data, auth: session.via, record: pickJoiner(record, heroList), previous: pickJoiner(previous, heroList), cycle,
        prefill,
        base: { name: base.name, current_alliance: base.current_alliance, from: base.from },
        identity,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not load your saved availability. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const session = await resolveSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const gateCheck = await checkFormOpen('joiner');
  if (!gateCheck.open) return NextResponse.json({ error: gateCheck.error }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const name = String(body?.name || '').trim();
  // The player id is the login (session). A member_id in the body is ignored, never trusted.
  const memberId = session.memberId;
  const alliance = String(body?.current_alliance || '').trim();
  const availability = String(body?.availability || '').trim();
  const pin = String(body?.pin || '');
  if (
    !name ||
    name.length > 120 ||
    !ALLIANCES.includes(alliance) ||
    !AVAILABILITY.includes(availability)
  ) {
    return NextResponse.json(
      { error: 'Enter your name and select alliance and availability.' },
      { status: 400 }
    );
  }
  try {
    const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
    const existing = await coll.findOne({ member_id: memberId });
    const troops = sanitizeRequiredKvkTroops(body, { allowedHeroes: await getActiveHeroNames(), existingHeroes: existing?.heroes });
    if (troops.error) return NextResponse.json({ error: troops.error }, { status: 400 });
    // First save: a signed-in member with no roster row yet gets one created below
    // (upsert keyed on their session member id). No error, nothing for them to do.
    // PIN only required for legacy sessions that still have a pin_hash.
    // Kingshot sessions are already verified via in-game code.
    if (existing && session.via !== 'kingshot' && existing.pin_hash) {
      if (!pin || pin.length > 120) {
        return NextResponse.json(
          { error: 'Enter your name and PIN, and select your alliance and availability.' },
          { status: 400 }
        );
      }
      const ok = await bcrypt.compare(pin, existing.pin_hash);
      if (!ok) {
        return NextResponse.json(
          { error: 'Incorrect PIN for this Member ID. Please try again.' },
          { status: 403 }
        );
      }
    }
    const now = new Date();
    const cycle = await getCurrentEventCycle('kvk').catch(() => null);
    if (existing) await snapshotIfFromPastCycle('kvk', existing, cycle);
    await coll.updateOne(
      { member_id: memberId },
      {
        $setOnInsert: { member_id: memberId, created_at: now },
        $set: {
          name,
          current_alliance: alliance,
          availability,
          ...troops.fields,
          updated_at: now,
          event_updated_at: now,
          ...(cycle ? { event_cycle_id: cycle.id, event_cycle_label: cycle.label } : {}),
        },
      },
      { upsert: true }
    );
    // Remember the troops + heroes on the member's profile too (only those fields), Power Profile or not.
    await saveTroopsToProfile(memberId, troops.fields, now);
    const row = await coll.findOne(
      { member_id: memberId },
      {
        projection: {
          name: 1,
          member_id: 1,
          current_alliance: 1,
          availability: 1,
          infantry_tier: 1, infantry_tg: 1, cavalry_tier: 1, cavalry_tg: 1, archer_tier: 1, archer_tg: 1,
          heroes: 1,
          updated_at: 1,
          _id: 0,
        },
      }
    );
    return NextResponse.json({ row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { error: 'Could not save your availability. Please try again.' },
      { status: 500 }
    );
  }
}
