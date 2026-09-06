import bcrypt from 'bcryptjs';
import { getCollection } from './mongo.js';

/** Player IDs that are always bootstrapped as superadmin. */
export const INITIAL_SUPERADMIN_PLAYER_IDS = ['108051086', '106599852'];

/** @deprecated use INITIAL_SUPERADMIN_PLAYER_IDS */
export const INITIAL_PERSONAL_CODE_PLAYER_ID = INITIAL_SUPERADMIN_PLAYER_IDS[0];

export class KingshotAccountBootstrapError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'KingshotAccountBootstrapError';
  }
}

/** Idempotent: ensure listed superadmin users exist in Mongo. */
export async function ensureInitialKingshotOwner() {
  try {
    const users = await getCollection('kingshot_users');
    const codes = await getCollection('kingshot_personal_codes');

    for (const playerId of INITIAL_SUPERADMIN_PLAYER_IDS) {
      await users.updateOne(
        { player_id: playerId },
        {
          $set: {
            player_id: playerId,
            access_role: 'superadmin',
            kingdom_id: 710,
            updated_at: new Date(),
          },
          $setOnInsert: {
            nickname: playerId === '108051086' ? 'Owner' : `Governor ${playerId}`,
            created_at: new Date(),
          },
        },
        { upsert: true }
      );

      // Only seed a default personal code for the original owner account.
      if (playerId === '108051086') {
        const existing = await codes.findOne({ player_id: playerId });
        if (!existing) {
          const hash = await bcrypt.hash('K710-OWNER', 10);
          await codes.insertOne({
            player_id: playerId,
            code_hash: hash,
            active: true,
            created_at: new Date(),
          });
        }
      }
    }
  } catch (error) {
    throw new KingshotAccountBootstrapError(
      'Personal login database setup is incomplete.',
      error
    );
  }
}
