import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { readKingshotSession } from '../../../lib/memberAuthKingshot';

const ALLIANCES = ['710', 'RED', 'SKY'];
const AVAILABILITY = [
  'First half (12-14:30 UTC)',
  'Second half (14:30-17 UTC)',
  'Full battle (12-17 UTC)',
  'Not Available',
];

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
          updated_at: 1,
          _id: 0,
        },
      }
    );
    return NextResponse.json(
      { row: data, auth: session.via },
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
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const name = String(body?.name || '').trim();
  const memberId = String(body?.member_id || '').trim();
  const alliance = String(body?.current_alliance || '').trim();
  const availability = String(body?.availability || '').trim();
  const pin = String(body?.pin || '');
  if (memberId !== session.memberId) {
    return NextResponse.json(
      { error: 'Sign in with this Player ID to update its availability.' },
      { status: 403 }
    );
  }
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
    if (!existing) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }
    // PIN only required for legacy sessions that still have a pin_hash.
    // Kingshot sessions are already verified via in-game code.
    if (session.via !== 'kingshot' && existing.pin_hash) {
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
    await coll.updateOne(
      { member_id: memberId },
      {
        $set: {
          name,
          current_alliance: alliance,
          availability,
          updated_at: now,
          event_updated_at: now,
        },
      }
    );
    const row = await coll.findOne(
      { member_id: memberId },
      {
        projection: {
          name: 1,
          member_id: 1,
          current_alliance: 1,
          availability: 1,
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
