import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { publicFlamedragonRecord, sanitizeFlamedragonInput, buildMergeSafePayload, currentHeroesOnly } from '../../../lib/flamedragonForm.mjs';
import { getCurrentEventCycle, loadMemberCycleRecord, snapshotIfFromPastCycle } from '../../../lib/eventCycles.server';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { loadDragonFallback } from '../../../lib/memberPrefill.server.js';
import { readMemberSession } from '../../../lib/memberAuth';

const PUBLIC_PROJECT = {
  member_id: 1,
  name: 1,
  current_alliance: 1,
  infantry_tier: 1,
  infantry_tg: 1,
  cavalry_tier: 1,
  cavalry_tg: 1,
  archer_tier: 1,
  archer_tg: 1,
  heroes: 1,
  charms: 1,
  governor_gear: 1,
  pet_power: 1,
  masters_power: 1,
  mystic_trial_score: 1,
  availability: 1,
  voice_chat: 1,
  auto_help: 1,
  updated_at: 1,
  _id: 0,
};

const UNAUTHORIZED = () => NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return UNAUTHORIZED();
  try {
    // `record` is this Flamedragon cycle's answer (null until saved); `previous` is the latest
    // earlier-cycle answer, offered as a pre-filled starting point.
    const { cycle, record, previous } = await loadMemberCycleRecord('dragon', session.memberId);
    const strip = (row) => {
      if (!row) return null;
      const out = publicFlamedragonRecord(Object.fromEntries(Object.entries(row).filter(([k]) => k in PUBLIC_PROJECT || k === 'event_cycle_label')));
      // Heroes retired from the shared list are not offered again (the stored data is untouched).
      if (Array.isArray(out.heroes)) out.heroes = currentHeroesOnly(out.heroes);
      return out;
    };
    // No answer in any cycle yet: offer what is already known (Power Profile, KvK Availability, Kingshot name).
    const fallback = record || previous ? null : await loadDragonFallback(session.memberId);
    return NextResponse.json({ member_id: session.memberId, record: strip(record), previous: strip(previous), cycle, fallback });
  } catch (error) {
    console.error('flamedragon GET failed', error);
    return NextResponse.json({ error: 'Could not load your form. Please try again.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return UNAUTHORIZED();
  const gateCheck = await checkFormOpen('dragon');
  if (!gateCheck.open) return NextResponse.json({ error: gateCheck.error }, { status: 403 });
  let record;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  let existing;
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    existing = await coll.findOne({ member_id: session.memberId });
  } catch (error) {
    console.error('flamedragon POST failed', error);
    return NextResponse.json({ error: 'Could not save your form. Please try again.' }, { status: 500 });
  }
  try {
    // Identity comes from the signed session, never from the request body.
    // A partial body on an existing record keeps the stored name.
    const named = existing && !('name' in body) ? { ...body, name: existing.name } : body;
    record = sanitizeFlamedragonInput({ ...named, member_id: session.memberId, pin: 'session' }, { existingHeroes: existing?.heroes });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    const fullPayload = {
      member_id: record.member_id,
      name: record.name,
      current_alliance: record.current_alliance || null,
      infantry_tier: record.infantry_tier || null,
      infantry_tg: record.infantry_tg || null,
      cavalry_tier: record.cavalry_tier || null,
      cavalry_tg: record.cavalry_tg || null,
      archer_tier: record.archer_tier || null,
      archer_tg: record.archer_tg || null,
      heroes: record.heroes,
      charms: record.charms || null,
      governor_gear: record.governor_gear || null,
      pet_power: record.pet_power || null,
      masters_power: record.masters_power || null,
      mystic_trial_score: record.mystic_trial_score || null,
      availability: record.availability || null,
      voice_chat: record.voice_chat || null,
      auto_help: record.auto_help || null,
      updated_at: new Date(),
    };
    const payload = buildMergeSafePayload(fullPayload, body, existing);
    const cycle = await getCurrentEventCycle('flamedragon').catch(() => null);
    await snapshotIfFromPastCycle('flamedragon', existing, cycle);
    if (cycle) {
      payload.event_cycle_id = cycle.id;
      payload.event_cycle_label = cycle.label;
    }
    await coll.updateOne({ member_id: record.member_id }, { $set: payload }, { upsert: true });
    const data = await coll.findOne({ member_id: record.member_id }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({
      status: existing ? 'updated' : 'created',
      record: publicFlamedragonRecord(data),
    });
  } catch (error) {
    console.error('flamedragon POST failed', error);
    return NextResponse.json({ error: 'Could not save your form. Please try again.' }, { status: 500 });
  }
}
