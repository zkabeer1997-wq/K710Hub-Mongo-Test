import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';

const SECTIONS = ['Tools and Calculators', 'Forms', 'Events', 'Guides', 'General'];
const ALLIANCES = ['710', 'RED', 'SKY'];
const MAX_MESSAGE_LENGTH = 2000;

export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
    const data = await coll.findOne(
      { member_id: session.memberId },
      { projection: { name: 1, member_id: 1, current_alliance: 1, _id: 0 } }
    );
    return NextResponse.json(
      {
        profile: data || {
          name: '',
          member_id: session.memberId,
          current_alliance: '',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not load your profile. Please try again.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const currentAlliance = String(body?.current_alliance || '').trim();
  const section = String(body?.section || '').trim();
  const message = String(body?.message || '').trim();
  if (!ALLIANCES.includes(currentAlliance)) {
    return NextResponse.json({ error: 'Select your current alliance.' }, { status: 400 });
  }
  if (!SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Select a section for your request.' }, { status: 400 });
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Enter your suggestion (up to ${MAX_MESSAGE_LENGTH} characters).` },
      { status: 400 }
    );
  }
  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const profile = await submissions.findOne(
      { member_id: session.memberId },
      { projection: { name: 1 } }
    );
    const requests = await getCollection(COLLECTIONS.WEBSITE_REQUESTS);
    const doc = {
      id: randomUUID(),
      member_id: session.memberId,
      name: profile?.name || session.memberId,
      current_alliance: currentAlliance,
      section,
      message,
      status: 'new',
      created_at: new Date(),
    };
    await requests.insertOne(doc);
    const { _id, ...row } = doc;
    return NextResponse.json({ row });
  } catch {
    return NextResponse.json(
      { error: 'Could not submit your request. Please try again.' },
      { status: 500 }
    );
  }
}
