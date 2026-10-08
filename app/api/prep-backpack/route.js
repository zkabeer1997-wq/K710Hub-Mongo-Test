import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { readMemberSession } from '../../../lib/memberAuth';
import { loadMemberBase } from '../../../lib/memberPrefill.server.js';
import { getCurrentEventCycle, loadMemberCycleRecord } from '../../../lib/eventCycles.server.js';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };

// This cycle's booking, plus the most recent earlier one so the form can offer it as a
// pre-filled starting point (never auto-submitted).
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401, headers: HEADERS });
  try {
    const { cycle, record, previous } = await loadMemberCycleRecord('prep', session.memberId);
    // With no answer in any cycle, `base` has the name we already know (Power Profile / Kingshot).
    const base = record || previous ? null : await loadMemberBase(session.memberId);
    return NextResponse.json(
      { member_id: session.memberId, record, previous, cycle, ...(base ? { base: { name: base.name, from: base.from } } : {}) },
      { headers: HEADERS }
    );
  } catch (error) {
    console.error('prep-backpack GET failed', error);
    return NextResponse.json({ error: 'Could not load your booking. Please try again.' }, { status: 500, headers: HEADERS });
  }
}

export async function POST(request) {
  try {
    const session = await readMemberSession(request);
    if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
    const gateCheck = await checkFormOpen('prep');
    if (!gateCheck.open) return NextResponse.json({ error: gateCheck.error }, { status: 403 });

    let data;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const str = (v) => String(v == null ? '' : v);
    const arr = (v) => (Array.isArray(v) ? v.map(String) : []);

    const payload = {
      member_id: session.memberId,
      in_game_name: str(data.in_game_name),
      want_construction: str(data.want_construction),
      construction_upgrades: arr(data.construction_upgrades),
      ttg_used: str(data.ttg_used),
      tg_used: str(data.tg_used),
      want_research: str(data.want_research),
      t11_troops: arr(data.t11_troops),
      tg_dust: str(data.tg_dust),
      research_speedup_days: str(data.research_speedup_days),
      want_troop_training: str(data.want_troop_training),
      is_transfer: str(data.is_transfer),
      troop_speedup_days: str(data.troop_speedup_days),
      promoting_t11: str(data.promoting_t11),
      avail_day1: arr(data.avail_day1),
      avail_day2: arr(data.avail_day2),
      avail_day4: arr(data.avail_day4),
      avail_day5: arr(data.avail_day5),
      notes: str(data.notes),
      updated_at: new Date(),
    };

    if (!payload.member_id || !payload.in_game_name) {
      return NextResponse.json({ error: 'Missing Member ID or in-game name.' }, { status: 400 });
    }

    // One booking per member per KvK cycle: saving again in the same cycle replaces it,
    // a new cycle starts a fresh row and keeps the old one for history.
    const cycle = await getCurrentEventCycle('kvk');
    if (!cycle) return NextResponse.json({ error: 'There is no active KvK cycle yet.' }, { status: 409 });
    payload.event_cycle_id = cycle.id;
    payload.event_cycle_label = cycle.label;
    const coll = await getCollection(COLLECTIONS.PREP_BACKPACK);
    await coll.updateOne(
      { member_id: payload.member_id, event_cycle_id: cycle.id },
      { $set: payload, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, cycle: { id: cycle.id, label: cycle.label } });
  } catch (error) {
    console.error('prep-backpack' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
