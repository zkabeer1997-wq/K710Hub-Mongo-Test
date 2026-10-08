import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { publicPowerProfile, sanitizePowerProfileInput } from '../../../lib/powerProfiles.mjs';

const PUBLIC_PROJECT = {
  member_id: 1,
  name: 1,
  governor_gear: 1,
  charms: 1,
  hero_gear: 1,
  pet_power: 1,
  masters_power: 1,
  mystic_trial_score: 1,
  infantry_tier: 1,
  infantry_tg: 1,
  cavalry_tier: 1,
  cavalry_tg: 1,
  archer_tier: 1,
  archer_tg: 1,
  heroes: 1,
  updated_at: 1,
  _id: 0,
};

export async function GET(request) {
  // Prefill is only for the signed-in player's own record. Without this
  // check anyone could read any member's profile by guessing a Member ID.
  const session = await readMemberSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in to load your profile.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const memberId = String(url.searchParams.get('member_id') || session.memberId).trim();
  if (memberId !== session.memberId) {
    return NextResponse.json({ error: 'You can only load your own profile.' }, { status: 403 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const data = await coll.findOne({ member_id: memberId }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({ profile: publicPowerProfile(data) });
  } catch (error) {
    console.error('power-profile' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }
  const gateCheck = await checkFormOpen('lead');
  if (!gateCheck.open) return NextResponse.json({ error: gateCheck.error }, { status: 403 });
  let profile;
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    profile = sanitizePowerProfileInput(rawBody);
  } catch (error) {
    // sanitize* throws deliberate, user-facing validation messages only.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (profile.member_id !== session.memberId) {
    return NextResponse.json(
      { error: 'Sign in with this Member ID to update its Power Profile.' },
      { status: 403 }
    );
  }
  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const existing = await coll.findOne(
      { member_id: profile.member_id },
      { projection: { member_id: 1 } }
    );
    const payload = {
      name: profile.name,
      member_id: profile.member_id,
      governor_gear: profile.governor_gear || null,
      charms: profile.charms || null,
      hero_gear: profile.hero_gear || null,
      pet_power: profile.pet_power || null,
      masters_power: profile.masters_power || null,
      mystic_trial_score: profile.mystic_trial_score || null,
      infantry_tier: profile.infantry_tier || null,
      infantry_tg: profile.infantry_tg || null,
      cavalry_tier: profile.cavalry_tier || null,
      cavalry_tg: profile.cavalry_tg || null,
      archer_tier: profile.archer_tier || null,
      archer_tg: profile.archer_tg || null,
      heroes: profile.heroes,
      updated_at: new Date(),
    };
    await coll.updateOne({ member_id: profile.member_id }, { $set: payload }, { upsert: true });
    const data = await coll.findOne({ member_id: profile.member_id }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({
      profile: publicPowerProfile(data),
      status: existing ? 'updated' : 'created',
    });
  } catch (error) {
    console.error('power-profile' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
