import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { mergePowerProfilesIntoRows } from '../../../lib/powerProfiles.mjs';

const PROJECT = {
  member_id: 1,
  name: 1,
  current_alliance: 1,
  infantry_tier: 1,
  infantry_tg: 1,
  cavalry_tier: 1,
  cavalry_tg: 1,
  archer_tier: 1,
  archer_tg: 1,
  heroes: 1,
  charms: 1,
  governor_gear: 1,
  pet_power: 1,
  masters_power: 1,
  mystic_trial_score: 1,
  availability: 1,
  voice_chat: 1,
  auto_help: 1,
  updated_at: 1,
  _id: 0,
};

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const formsColl = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    const profilesColl = await getCollection(COLLECTIONS.POWER_PROFILES);
    const [data, profiles] = await Promise.all([
      formsColl.find({}).project(PROJECT).sort({ updated_at: -1 }).toArray(),
      profilesColl
        .find({})
        .project({
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
        })
        .toArray(),
    ]);
    return NextResponse.json({
      rows: mergePowerProfilesIntoRows(data || [], profiles || []),
      configured: true,
    });
  } catch (error) {
    console.error('admin-flamedragon GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get('scope') !== 'test') {
    return NextResponse.json({ error: 'Unsupported delete scope' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    const candidates = await coll.find({}).project({ member_id: 1, name: 1, _id: 0 }).toArray();
    const deletedMemberIds = (candidates || [])
      .filter((row) => {
        const memberId = String(row.member_id || '');
        const name = String(row.name || '');
        return memberId.startsWith('TEST710') || name.startsWith('Test Seed');
      })
      .map((row) => String(row.member_id));
    if (deletedMemberIds.length === 0) {
      return NextResponse.json({ deletedMemberIds: [] });
    }
    await coll.deleteMany({ member_id: { $in: deletedMemberIds } });
    return NextResponse.json({ deletedMemberIds });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const name = String(payload?.name || '').trim();
  const memberId = String(payload?.member_id || '').trim();
  if (!name || !memberId) {
    return NextResponse.json({ error: 'Name and Member ID are required.' }, { status: 400 });
  }
  const pick = (key) =>
    payload?.[key] !== undefined && payload[key] !== '' ? payload[key] : null;
  const record = {
    name,
    member_id: memberId,
    current_alliance: pick('current_alliance'),
    infantry_tier: pick('infantry_tier'),
    infantry_tg: pick('infantry_tg'),
    cavalry_tier: pick('cavalry_tier'),
    cavalry_tg: pick('cavalry_tg'),
    archer_tier: pick('archer_tier'),
    archer_tg: pick('archer_tg'),
    heroes: Array.isArray(payload?.heroes) ? payload.heroes : [],
    availability: pick('availability'),
    pin_hash: 'admin-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    updated_at: new Date(),
  };
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    await coll.insertOne(record);
    const { pin_hash, ...safe } = record;
    const [row] = mergePowerProfilesIntoRows([safe], []);
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
