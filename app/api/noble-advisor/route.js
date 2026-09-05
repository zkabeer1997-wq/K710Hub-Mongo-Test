import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { validateNobleAdvisor } from '../../../lib/nobleAdvisor.mjs';
import { getFormGate } from '../../../lib/formGates.server.js';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401, headers });
  try {
    const nobleColl = await getCollection('noble_advisor_submissions');
    const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
    const [record, profile] = await Promise.all([
      nobleColl.findOne({ member_id: session.memberId }),
      profiles.findOne({ member_id: session.memberId }, { projection: { name: 1 } }),
    ]);
    const { _id, ...safe } = record || {};
    return NextResponse.json(
      {
        record: record
          ? { ...safe, id: safe.id || String(_id) }
          : { in_game_name: profile?.name || '', member_id: session.memberId },
      },
      { headers }
    );
  } catch {
    return NextResponse.json({ error: 'Unable to load your booking.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401, headers });
  if ((await getFormGate('noble')).is_open === false) {
    return NextResponse.json({ error: 'Noble Advisor bookings are closed.' }, { status: 403, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid booking.' }, { status: 400, headers });
  }
  const { record, error } = validateNobleAdvisor(body);
  if (error) return NextResponse.json({ error }, { status: 400, headers });
  try {
    const coll = await getCollection('noble_advisor_submissions');
    await coll.updateOne(
      { member_id: session.memberId },
      {
        $set: {
          ...record,
          member_id: session.memberId,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to save your booking.' }, { status: 500, headers });
  }
}
