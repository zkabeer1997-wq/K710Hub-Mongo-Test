import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

const VALID_STATUSES = ['special', 'normal', 'reject', 'waitlist', 'pending'];
const ACCEPT_STATUSES = ['special', 'normal'];

/**
 * Accept creates a Kingshot-ready member (kingshot_users + roster + power profile).
 * Login is via Player ID + in-game code — no PIN is required or returned.
 */
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
  const note = body.note != null ? String(body.note).trim().slice(0, 500) : undefined;

  if (!id) {
    return NextResponse.json({ error: 'Submission id is required.' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unsupported status.' }, { status: 400 });
  }

  try {
    const interestColl = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    const submission = await interestColl.findOne({
      $or: [{ id }, ...(id.length === 24 ? [{ _id: id }] : [])],
    });
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    }

    let accountResult = null;

    if (ACCEPT_STATUSES.includes(status)) {
      const playerId = String(submission.player_id || '').trim();
      const name = String(submission.in_game_name || '').trim();
      if (!playerId || !name) {
        return NextResponse.json(
          {
            error:
              'Applicant is missing a Player ID or in-game name, so a member account cannot be created.',
          },
          { status: 400 }
        );
      }

      const now = new Date();
      const allianceHint = String(submission.migrate_alliance || '').trim() || null;

      const users = await getCollection('kingshot_users');
      const existingUser = await users.findOne({ player_id: playerId });
      let userCreated = false;
      if (!existingUser) {
        await users.insertOne({
          player_id: playerId,
          nickname: name,
          kingdom_id: 710,
          access_role: 'member',
          alliance_abbr: allianceHint,
          created_at: now,
          updated_at: now,
          source: 'interest_accept',
        });
        userCreated = true;
      } else {
        await users.updateOne(
          { player_id: playerId },
          {
            $set: {
              updated_at: now,
              ...(existingUser.nickname ? {} : { nickname: name }),
              ...(allianceHint && !existingUser.alliance_abbr
                ? { alliance_abbr: allianceHint }
                : {}),
            },
          }
        );
      }

      const submissions = await getCollection(COLLECTIONS.SUBMISSIONS);
      const existingRecord = await submissions.findOne({ member_id: playerId });
      let recordCreated = false;
      if (!existingRecord) {
        await submissions.insertOne({
          name,
          member_id: playerId,
          current_alliance: allianceHint,
          heroes: [],
          created_at: now,
          updated_at: now,
          event_updated_at: now,
          source: 'interest_accept',
        });
        recordCreated = true;
      }

      const profiles = await getCollection(COLLECTIONS.POWER_PROFILES);
      const existingProfile = await profiles.findOne({ member_id: playerId });
      let profileCreated = false;
      if (!existingProfile) {
        await profiles.insertOne({
          member_id: playerId,
          name,
          updated_at: now,
        });
        profileCreated = true;
      }

      accountResult = {
        player_id: playerId,
        name,
        login: 'kingshot',
        message:
          'Member is ready. They should log in at /login or /player-record with their Player ID and in-game verification code.',
        userCreated,
        userExisted: !!existingUser,
        recordCreated,
        recordExisted: !!existingRecord,
        profileCreated,
        profileExisted: !!existingProfile,
      };
    }

    const setFields = {
      status,
      decided_at: new Date(),
    };
    if (note !== undefined) setFields.admin_note = note;

    await interestColl.updateOne(
      { $or: [{ id }, ...(id.length === 24 ? [{ _id: id }] : [])] },
      { $set: setFields }
    );
    const updated = await interestColl.findOne({
      $or: [{ id }, ...(id.length === 24 ? [{ _id: id }] : [])],
    });
    const { _id, ...row } = updated || {};
    return NextResponse.json({
      row: { ...row, id: row.id || String(_id) },
      account: accountResult,
    });
  } catch (error) {
    console.error('admin-interest-status failed', error);
    return NextResponse.json({ error: error.message || 'Update failed.' }, { status: 500 });
  }
}
