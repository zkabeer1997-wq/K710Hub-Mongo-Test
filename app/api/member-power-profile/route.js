import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { loadLoginMystic } from '../../../lib/loginMystic.server.js';
import { powerProfileDoneAt, resolveMysticScore } from '../../../lib/powerProfiles.mjs';

// General Power Profile -> tools linkage: returns the signed-in member's
// saved power_profiles document so a calculator can pre-fill from it.
// member-charm-profile already does this for the charms field alone
// (consumed by CharmPackOptimizer); this covers the rest of the profile
// for tools that want to auto-fill governor gear, pet power, masters
// power, or Mystic Trial score.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });

  try {
    const coll = await getCollection(COLLECTIONS.POWER_PROFILES);
    const data = await coll.findOne(
      { member_id: session.memberId },
      {
        projection: {
          member_id: 1,
          governor_gear: 1,
          charms: 1,
          pet_power: 1,
          masters_power: 1,
          mystic_trial_score: 1,
          updated_at: 1,
          created_at: 1,
          hero_gear: 1,
          _id: 0,
        },
      }
    );
    // A document that only remembers troops from the KvK / Flamedragon forms is not a saved Power Profile.
    if (!powerProfileDoneAt(data)) return NextResponse.json({ profile: null });
    // Same Mystic Trial value as the dashboard and the member's own review (sign-in value first).
    const mystic = resolveMysticScore({ login: await loadLoginMystic(session.memberId), saved: data.mystic_trial_score });
    return NextResponse.json({ profile: { ...data, mystic_trial_score: mystic.value || data.mystic_trial_score } });
  } catch (error) {
    console.error('member-power-profile GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved Power Profile profile.' }, { status: 500 });
  }
}
