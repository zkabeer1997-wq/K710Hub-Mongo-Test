import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

// General Gear Tracking -> tools linkage: returns the signed-in member's
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
          _id: 0,
        },
      }
    );
    return NextResponse.json({ profile: data || null });
  } catch (error) {
    console.error('member-power-profile GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved Gear Tracking profile.' }, { status: 500 });
  }
}
