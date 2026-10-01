import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { getFormGate } from '../../../lib/formGates.server.js';
import { findEventForm, validateParticipation } from '../../../lib/eventForms.mjs';
import { windowState, windowMessage } from '../../../lib/deadlines.mjs';

const HEADERS = { 'Cache-Control': 'private, no-store' };

function windowPayload(gate, now) {
  const win = windowState(gate, now, { requireWindow: true });
  return { state: win.state, opensAt: win.opensAt, closesAt: win.closesAt, message: windowMessage(win, { now }), note: gate.message || '' };
}

function publicEntry(row) {
  if (!row) return null;
  return { vote: row.vote, power: row.power, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
}

// GET /api/event-participation?form=swordland-showdown -> window state + this member's entry
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  const form = findEventForm(new URL(request.url).searchParams.get('form'));
  if (!form) return NextResponse.json({ error: 'Unknown form.' }, { status: 404, headers: HEADERS });
  const now = Date.now();
  try {
    const gate = await getFormGate(form.gateKey);
    const coll = await getCollection(COLLECTIONS.EVENT_PARTICIPATION);
    const row = await coll.findOne(
      { member_id: session.memberId, form_id: form.slug, cycle_id: gate.cycle_id || 'current' },
      { projection: { vote: 1, power: 1, updated_at: 1, _id: 0 } },
    );
    return NextResponse.json({ window: windowPayload(gate, now), entry: publicEntry(row), cycle_id: gate.cycle_id || 'current' }, { headers: HEADERS });
  } catch (error) {
    console.error('event-participation GET failed', error);
    return NextResponse.json({ error: 'Could not load this form. Please try again.' }, { status: 500, headers: HEADERS });
  }
}

// POST { form, vote, power } -> upsert on (member_id, form_id, cycle_id). The
// window is enforced here, not just in the UI.
export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: HEADERS });
  }
  const form = findEventForm(String(body?.form || ''));
  if (!form) return NextResponse.json({ error: 'Unknown form.' }, { status: 404, headers: HEADERS });
  const { value, error } = validateParticipation(body);
  if (error) return NextResponse.json({ error }, { status: 400, headers: HEADERS });

  const now = Date.now();
  try {
    const gate = await getFormGate(form.gateKey);
    const win = windowState(gate, now, { requireWindow: true });
    if (win.state !== 'open') {
      return NextResponse.json({ error: windowMessage(win, { now }), window: windowPayload(gate, now) }, { status: 403, headers: HEADERS });
    }
    const cycleId = gate.cycle_id || 'current';
    const coll = await getCollection(COLLECTIONS.EVENT_PARTICIPATION);
    const filter = { member_id: session.memberId, form_id: form.slug, cycle_id: cycleId };
    const update = {
      $set: { ...value, updated_at: new Date(now) },
      $setOnInsert: { ...filter, created_at: new Date(now) },
    };
    try {
      await coll.updateOne(filter, update, { upsert: true });
    } catch (err) {
      // Two simultaneous first saves can race on the unique index; the retry updates.
      if (err?.code !== 11000) throw err;
      await coll.updateOne(filter, update, { upsert: true });
    }
    return NextResponse.json({ ok: true, entry: { ...value, updated_at: new Date(now).toISOString() } }, { headers: HEADERS });
  } catch (err) {
    console.error('event-participation POST failed', err);
    return NextResponse.json({ error: 'Could not save your vote. Please try again.' }, { status: 500, headers: HEADERS });
  }
}
