import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { mergePowerProfilesIntoRows } from '../../../lib/powerProfiles.mjs';

const ADMIN_PROJECTION = {
  _id: 0,
  name: 1,
  member_id: 1,
  infantry_tier: 1,
  infantry_tg: 1,
  cavalry_tier: 1,
  cavalry_tg: 1,
  archer_tier: 1,
  archer_tg: 1,
  heroes: 1,
  availability: 1,
  current_alliance: 1,
  updated_at: 1,
};

const POWER_PROJECTION = {
  _id: 0,
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
};

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const powerProfilesColl = await getCollection(COLLECTIONS.POWER_PROFILES);

    const data = await submissions
      .find({}, { projection: ADMIN_PROJECTION })
      .sort({ name: 1 })
      .toArray();

    let powerProfiles = [];
    let powerProfilesConfigured = true;
    try {
      powerProfiles = await powerProfilesColl
        .find({}, { projection: POWER_PROJECTION })
        .toArray();
    } catch {
      powerProfilesConfigured = false;
    }

    return NextResponse.json({
      rows: mergePowerProfilesIntoRows(data || [], powerProfiles || []),
      powerProfilesConfigured,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');
  if (scope !== 'test') {
    return NextResponse.json({ error: 'Unsupported delete scope' }, { status: 400 });
  }
  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const powerProfiles = await getCollection(COLLECTIONS.POWER_PROFILES);

    const candidates = await submissions
      .find({}, { projection: { member_id: 1, name: 1 } })
      .toArray();

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

    await submissions.deleteMany({ member_id: { $in: deletedMemberIds } });
    await powerProfiles.deleteMany({ member_id: { $in: deletedMemberIds } });

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
  const name = String(payload && payload.name ? payload.name : '').trim();
  const memberId = String(payload && payload.member_id ? payload.member_id : '').trim();
  if (!name || !memberId) {
    return NextResponse.json({ error: 'Name and Member ID are required.' }, { status: 400 });
  }
  const pick = (key) =>
    payload && payload[key] !== undefined && payload[key] !== '' ? payload[key] : null;

  const record = {
    name,
    member_id: memberId,
    infantry_tier: pick('infantry_tier'),
    infantry_tg: pick('infantry_tg'),
    cavalry_tier: pick('cavalry_tier'),
    cavalry_tg: pick('cavalry_tg'),
    archer_tier: pick('archer_tier'),
    archer_tg: pick('archer_tg'),
    heroes: Array.isArray(payload && payload.heroes) ? payload.heroes : [],
    availability: pick('availability'),
    current_alliance: pick('current_alliance'),
    pin_hash: 'admin-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    created_at: new Date(),
    updated_at: new Date(),
  };

  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    await submissions.insertOne(record);

    const data = {
      name: record.name,
      member_id: record.member_id,
      infantry_tier: record.infantry_tier,
      infantry_tg: record.infantry_tg,
      cavalry_tier: record.cavalry_tier,
      cavalry_tg: record.cavalry_tg,
      archer_tier: record.archer_tier,
      archer_tg: record.archer_tg,
      heroes: record.heroes,
      availability: record.availability,
      current_alliance: record.current_alliance,
      updated_at: record.updated_at,
    };

    const [row] = mergePowerProfilesIntoRows([data], []);
    return NextResponse.json({ row });
  } catch (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
}
