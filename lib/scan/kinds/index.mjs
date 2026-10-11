import * as governorGameData from './governorProfile/gameData.mjs';
import * as backpackGameData from './heroGear/gameData.mjs';
import { validateGovernorProfileReading } from './governorProfile/validate.mjs';
import { validateBackpackGearReading } from './heroGear/validate.mjs';
import * as backpackInventoryGameData from './backpackInventory/gameData.mjs';
import { validateBackpackInventoryReading } from './backpackInventory/validate.mjs';
import { layoutProfileFor } from '../schemas.mjs';

export const KINDS = {
  governor_profile: { gameData: governorGameData, validate: validateGovernorProfileReading, profileSchema: layoutProfileFor('governor_profile') },
  backpack_inventory: { gameData: backpackInventoryGameData, validate: validateBackpackInventoryReading, profileSchema: layoutProfileFor('backpack_inventory') },
  hero_gear: { gameData: backpackGameData, validate: validateBackpackGearReading, profileSchema: layoutProfileFor('hero_gear') },
};

export function getKind(name) {
  if (!Object.hasOwn(KINDS, name)) {
    throw new Error(`Unknown scan kind "${name}". Known kinds: ${Object.keys(KINDS).join(', ')}`);
  }
  return KINDS[name];
}
