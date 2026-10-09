import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { readMemberSession } from '../../../../lib/memberAuth';
import { checkFormOpen } from '../../../../lib/formGates.server.js';
import { loadMemberBase } from '../../../../lib/memberPrefill.server.js';
import { publicPowerProfile } from '../../../../lib/powerProfiles.mjs';
import { sanitizeLoadoutSave } from '../../../../lib/loadoutSave.mjs';

// Saves a reviewed screenshot scan (or any board change) into the signed-in member's own power profile, so the
// tools and calculators start from it. Only governor_gear and charms are written; every other profile field is
// left alone. The scan image is never sent here. Corrections (what the reader said vs what the player chose)
// are kept per member in scan_corrections: they are how the reader gets measured and improved.
export async function POST(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const gateCheck = await checkFormOpen('lead');
  if (!gateCheck.open) return NextResponse.json({ error: gateCheck.error }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  let clean;
  try { clean = sanitizeLoadoutSave(body); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }

  try {
    const memberId = session.memberId;
    const now = new Date();
    const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
    const existing = await profiles.findOne({ member_id: memberId }, { projection: { member_id: 1, name: 1 } });
    const name = existing?.name || (await loadMemberBase(memberId))?.name || session.nickname || memberId;
    await profiles.updateOne(
      { member_id: memberId },
      { $set: { governor_gear: clean.governor_gear || null, charms: clean.charms || null, updated_at: now }, $setOnInsert: { member_id: memberId, name } },
      { upsert: true },
    );
    if (clean.corrections.length) {
      const coll = await getCollection(COLLECTIONS.SCAN_CORRECTIONS);
      await coll.insertMany(clean.corrections.map((c) => ({ ...c, member_id: memberId, kind: 'governor_profile', engine_version: clean.engine_version, created_at: now })));
    }
    const saved = await profiles.findOne({ member_id: memberId }, { projection: { _id: 0 } });
    return NextResponse.json({ profile: publicPowerProfile(saved), status: existing ? 'updated' : 'created', corrections_saved: clean.corrections.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('power-profile loadout failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
