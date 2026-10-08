import * as governorGameData from './governorProfile/gameData.mjs';
import * as backpackGameData from './backpackGear/gameData.mjs';
import { validateGovernorProfileReading } from './governorProfile/validate.mjs';
import { validateBackpackGearReading } from './backpackGear/validate.mjs';
import { layoutProfileFor } from '../schemas.mjs';

export const KINDS = {
  governor_profile: { gameData: governorGameData, validate: validateGovernorProfileReading, profileSchema: layoutProfileFor('governor_profile') },
  backpack_gear: { gameData: backpackGameData, validate: validateBackpackGearReading, profileSchema: layoutProfileFor('backpack_gear') },
};

export function getKind(name) {
  if (!Object.hasOwn(KINDS, name)) {
    throw new Error(`Unknown scan kind "${name}". Known kinds: ${Object.keys(KINDS).join(', ')}`);
  }
  return KINDS[name];
}
