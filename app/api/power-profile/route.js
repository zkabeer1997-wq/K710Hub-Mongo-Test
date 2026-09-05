import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
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
  const url = new URL(request.url);
  const memberId = String(url.searchParams.get('member_id') || '').trim();
  if (!memberId) {
    return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const data = await coll.findOne({ member_id: memberId }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({ profile: publicPowerProfile(data) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }
  let profile;
  try {
    profile = sanitizePowerProfileInput(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (profile.member_id !== session.memberId) {
    return NextResponse.json(
      { error: 'Sign in with this Member ID to update its Player Profile.' },
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
