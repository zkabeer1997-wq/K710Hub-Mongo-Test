import bcrypt from 'bcryptjs';
import { getCollection } from './mongo.js';

export const INITIAL_PERSONAL_CODE_PLAYER_ID = '108051086';

export class KingshotAccountBootstrapError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'KingshotAccountBootstrapError';
  }
}

/** Idempotent: ensure superadmin user + personal code exist in Mongo. */
export async function ensureInitialKingshotOwner() {
  try {
    const users = await getCollection('kingshot_users');
    await users.updateOne(
      { player_id: INITIAL_PERSONAL_CODE_PLAYER_ID },
      {
        $set: {
          player_id: INITIAL_PERSONAL_CODE_PLAYER_ID,
          access_role: 'superadmin',
          kingdom_id: 710,
          updated_at: new Date(),
        },
        $setOnInsert: {
          nickname: 'Owner',
          created_at: new Date(),
        },
      },
      { upsert: true }
    );

    const codes = await getCollection('kingshot_personal_codes');
    const existing = await codes.findOne({ player_id: INITIAL_PERSONAL_CODE_PLAYER_ID });
    if (!existing) {
      // Default bootstrap code — change via admin after first login.
      const hash = await bcrypt.hash('K710-OWNER', 10);
      await codes.insertOne({
        player_id: INITIAL_PERSONAL_CODE_PLAYER_ID,
        code_hash: hash,
        active: true,
        created_at: new Date(),
      });
    }
  } catch (error) {
    throw new KingshotAccountBootstrapError(
      'Personal login database setup is incomplete.',
      error
    );
  }
}
