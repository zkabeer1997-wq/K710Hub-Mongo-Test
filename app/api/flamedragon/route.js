import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { publicFlamedragonRecord, sanitizeFlamedragonInput } from '../../../lib/flamedragonForm.mjs';

const PUBLIC_PROJECT = {
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

function pinHash(pin) {
  return createHash('sha256').update('kvk-flamedragon-v1:' + pin).digest('hex');
}

export async function GET(request) {
  const url = new URL(request.url);
  const memberId = String(url.searchParams.get('member_id') || '').trim();
  if (!memberId) {
    return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    const data = await coll.findOne({ member_id: memberId }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({ record: publicFlamedragonRecord(data) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  let record;
  try {
    const body = await request.json();
    record = sanitizeFlamedragonInput(body);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.FLAMEDRAGON_FORMS);
    const existing = await coll.findOne(
      { member_id: record.member_id },
      { projection: { member_id: 1, pin_hash: 1 } }
    );
    const nextHash = pinHash(record.pin);
    if (existing && existing.pin_hash !== nextHash) {
      return NextResponse.json(
        { error: 'Incorrect PIN for this Member ID. Please try again.' },
        { status: 403 }
      );
    }
    const payload = {
      member_id: record.member_id,
      name: record.name,
      current_alliance: record.current_alliance || null,
      infantry_tier: record.infantry_tier || null,
      infantry_tg: record.infantry_tg || null,
      cavalry_tier: record.cavalry_tier || null,
      cavalry_tg: record.cavalry_tg || null,
      archer_tier: record.archer_tier || null,
      archer_tg: record.archer_tg || null,
      heroes: record.heroes,
      charms: record.charms || null,
      governor_gear: record.governor_gear || null,
      pet_power: record.pet_power || null,
      masters_power: record.masters_power || null,
      mystic_trial_score: record.mystic_trial_score || null,
      availability: record.availability || null,
      voice_chat: record.voice_chat || null,
      auto_help: record.auto_help || null,
      pin_hash: nextHash,
      updated_at: new Date(),
    };
    await coll.updateOne({ member_id: record.member_id }, { $set: payload }, { upsert: true });
    const data = await coll.findOne({ member_id: record.member_id }, { projection: PUBLIC_PROJECT });
    return NextResponse.json({
      status: existing ? 'updated' : 'created',
      record: publicFlamedragonRecord(data),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
