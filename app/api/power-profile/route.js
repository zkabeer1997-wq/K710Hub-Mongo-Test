import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { readMemberSession } from '../../../lib/memberAuth';
import { checkFormOpen } from '../../../lib/formGates.server.js';
import { loadMemberBase } from '../../../lib/memberPrefill.server.js';
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
  // Always the signed-in player's own record: a ?member_id= for anyone else is ignored.
  const memberId = session.memberId;
  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const data = await coll.findOne({ member_id: memberId }, { projection: PUBLIC_PROJECT });
    // `base`: name already known from other forms / the Kingshot profile, for a first-time profile.
    const base = data ? null : await loadMemberBase(memberId);
    return NextResponse.json(
      { profile: publicPowerProfile(data), ...(base ? { base: { name: base.name, from: base.from } } : {}) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
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
    // The Member ID is the login: whatever the body says, the session id is what is saved.
    profile = sanitizePowerProfileInput({ ...(rawBody && typeof rawBody === 'object' ? rawBody : {}), member_id: session.memberId });
  } catch (error) {
    // sanitize* throws deliberate, user-facing validation messages only.
    return NextResponse.json({ error: error.message }, { status: 400 });
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
      // Troop levels and heroes moved to the per-cycle KvK Availability form. Old values stay in the
      // document untouched (they prefill that form and back the admin views); they are not written here.
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
