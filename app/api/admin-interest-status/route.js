import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

const VALID_STATUSES = ['special', 'normal', 'reject', 'waitlist', 'pending'];
const ACCEPT_STATUSES = ['special', 'normal'];

function defaultPasswordFor(playerId) {
  return '710-' + String(playerId || '').trim();
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Submission id is required.' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unsupported status.' }, { status: 400 });
  }

  try {
    const interestColl = await getCollection('interest_submissions');
    const submission = await interestColl.findOne({ $or: [{ id }, { _id: id }] });
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    }

    let accountResult = null;

    if (ACCEPT_STATUSES.includes(status)) {
      const memberId = String(submission.player_id || '').trim();
      const name = String(submission.in_game_name || '').trim();
      if (!memberId || !name) {
        return NextResponse.json(
          {
            error:
              'Applicant is missing a Player ID or in-game name, so an account cannot be created.',
          },
          { status: 400 }
        );
      }
      const password = defaultPasswordFor(memberId);
      const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
      const existingRecord = await submissions.findOne({ member_id: memberId });

      let recordCreated = false;
      if (!existingRecord) {
        const pin_hash = await bcrypt.hash(password, 10);
        const now = new Date();
        await submissions.insertOne({
          name,
          member_id: memberId,
          pin_hash,
          heroes: [],
          created_at: now,
          updated_at: now,
          event_updated_at: now,
        });
        recordCreated = true;
      }

      const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
      const existingProfile = await profiles.findOne({ member_id: memberId });
      let profileCreated = false;
      if (!existingProfile) {
        await profiles.insertOne({
          member_id: memberId,
          name,
          updated_at: new Date(),
        });
        profileCreated = true;
      }

      accountResult = {
        member_id: memberId,
        name,
        password,
        recordCreated,
        recordExisted: !!existingRecord,
        profileCreated,
        profileExisted: !!existingProfile,
      };
    }

    await interestColl.updateOne(
      { $or: [{ id }, { _id: id }] },
      { $set: { status, decided_at: new Date() } }
    );
    const updated = await interestColl.findOne({ $or: [{ id }, { _id: id }] });
    const { _id, ...row } = updated || {};
    return NextResponse.json({
      row: { ...row, id: row.id || String(_id) },
      account: accountResult,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
