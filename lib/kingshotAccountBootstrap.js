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

/**
 * Idempotent: ensure listed superadmin users exist in Mongo.
 * Never seeds a personal code: provision those through the admin personal-codes tool.
 */
export async function ensureInitialKingshotOwner() {
  try {
    const users = await getCollection('kingshot_users');

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
    }
  } catch (error) {
    throw new KingshotAccountBootstrapError(
      'Personal login database setup is incomplete.',
      error
    );
  }
}
