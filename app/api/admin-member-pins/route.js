import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { mergePowerProfilesIntoRows } from '../../../lib/powerProfiles.mjs';

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const SIX_DIGIT_PIN_RE = /^\d{6}$/;

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function pinStatus(pinHash) {
  return BCRYPT_HASH_RE.test(String(pinHash || '')) ? 'secured' : 'needs_reset';
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const profilesColl = await getCollection(COLLECTIONS.POWER_PROFILES);

    const [data, profiles] = await Promise.all([
      submissions
        .find({})
        .project({
          name: 1,
          member_id: 1,
          pin_hash: 1,
          updated_at: 1,
          current_alliance: 1,
          infantry_tier: 1,
          infantry_tg: 1,
          cavalry_tier: 1,
          cavalry_tg: 1,
          archer_tier: 1,
          archer_tg: 1,
          _id: 0,
        })
        .sort({ name: 1 })
        .toArray(),
      profilesColl
        .find({})
        .project({
          member_id: 1,
          name: 1,
          governor_gear: 1,
          charms: 1,
          pet_power: 1,
          masters_power: 1,
          mystic_trial_score: 1,
          infantry_tier: 1,
          infantry_tg: 1,
          cavalry_tier: 1,
          cavalry_tg: 1,
          archer_tier: 1,
          archer_tg: 1,
          updated_at: 1,
          _id: 0,
        })
        .toArray(),
    ]);

    const merged = mergePowerProfilesIntoRows(data || [], profiles || []);

    return noStoreJson({
      rows: merged.map(({ pin_hash, power_profile, ...row }) => ({
        ...row,
        name: row.name || '',
        member_id: row.member_id || '',
        pin_status: pinStatus(pin_hash),
        updated_at: row.updated_at || null,
      })),
    });
  } catch (error) {
    console.error('admin-member-pins GET failed', error);
    return noStoreJson({ error: 'Unable to load member PIN status.' }, { status: 500 });
  }
}

// Create a new roster member and initial PIN.
export async function PUT(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = String(body?.name || '').trim();
  const memberId = String(body?.memberId || '').trim();
  const pin = String(body?.pin || '').trim();

  if (!name || name.length > 120) {
    return noStoreJson({ error: 'Enter a valid member name.' }, { status: 400 });
  }
  if (!memberId || memberId.length > 120) {
    return noStoreJson({ error: 'Enter a valid Member ID.' }, { status: 400 });
  }
  if (!SIX_DIGIT_PIN_RE.test(pin)) {
    return noStoreJson({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
  }

  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const existing = await submissions.findOne({ member_id: memberId });
    if (existing) {
      return noStoreJson({ error: 'That Member ID already exists.' }, { status: 409 });
    }

    const pin_hash = await bcrypt.hash(pin, 10);
    const now = new Date();
    await submissions.insertOne({
      name,
      member_id: memberId,
      pin_hash,
      heroes: [],
      updated_at: now,
      event_updated_at: now,
      created_at: now,
    });

    return noStoreJson({
      ok: true,
      row: {
        name,
        member_id: memberId,
        pin_status: 'secured',
        updated_at: now.toISOString(),
      },
      pin,
      message: 'Member created. The PIN is stored only as a secure hash.',
    });
  } catch (error) {
    console.error('admin-member-pins PUT failed', error);
    return noStoreJson({ error: 'Unable to create member.' }, { status: 500 });
  }
}

// Reset PIN for an existing member.
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const memberId = String(body?.memberId || '').trim();
  if (!memberId || memberId.length > 120) {
    return noStoreJson({ error: 'Invalid Member ID.' }, { status: 400 });
  }

  const newPin = String(randomInt(0, 1_000_000)).padStart(6, '0');

  try {
    const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
    const pin_hash = await bcrypt.hash(newPin, 10);
    const result = await submissions.updateOne(
      { member_id: memberId },
      { $set: { pin_hash, updated_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      return noStoreJson({ error: 'Member not found.' }, { status: 404 });
    }

    return noStoreJson({
      ok: true,
      memberId,
      pin: newPin,
      message: 'PIN reset. This replacement PIN is shown only in this response.',
    });
  } catch (error) {
    console.error('admin-member-pins POST failed', error);
    return noStoreJson({ error: 'Unable to reset member PIN.' }, { status: 500 });
  }
}
