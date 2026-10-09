// Validation for saving a reviewed Governor Gear + Charms loadout straight into the member's power profile
// (POST /api/power-profile/loadout). Pure: no Mongo, no Next. The image of a scan is never part of this.
import { CHARM_LEVEL_OPTIONS, GOVERNOR_GEAR_OPTIONS } from './equipmentOptions.mjs';
import {
  parseCharmSelections, parseGovernorGearSelections, serializeCharmSelections, serializeGovernorGearSelections,
  CHARM_SLOTS, GOVERNOR_GEAR_SLOTS,
} from './powerProfiles.mjs';
import { ScanCorrection } from './scan/schemas.mjs';

const GEAR_OK = new Set(GOVERNOR_GEAR_OPTIONS);
const CHARM_OK = new Set(CHARM_LEVEL_OPTIONS);
export const MAX_CORRECTIONS = 60;

function cleanSelections(parsed, slots, allowed, what) {
  const out = {};
  for (const slot of slots) {
    const value = parsed[slot.key] || '';
    if (value && !allowed.has(value)) throw new Error(`"${value}" is not a valid ${what}.`);
    out[slot.key] = value;
  }
  return out;
}

/**
 * @param {unknown} body { governor_gear: string, charms: string, corrections?: ScanCorrection[], engine_version?: string }
 * @returns {{ governor_gear: string, charms: string, corrections: object[], engine_version: string }}
 * @throws {Error} with a message that is safe to show to the member
 */
export function sanitizeLoadoutSave(body) {
  if (!body || typeof body !== 'object') throw new Error('Invalid request.');
  const gear = cleanSelections(parseGovernorGearSelections(body.governor_gear), GOVERNOR_GEAR_SLOTS, GEAR_OK, 'gear value');
  const charms = cleanSelections(parseCharmSelections(body.charms), CHARM_SLOTS, CHARM_OK, 'charm level');
  const corrections = [];
  for (const raw of Array.isArray(body.corrections) ? body.corrections.slice(0, MAX_CORRECTIONS) : []) {
    const parsed = ScanCorrection.safeParse(raw);
    if (parsed.success) corrections.push(parsed.data);
  }
  return {
    governor_gear: serializeGovernorGearSelections(gear),
    charms: serializeCharmSelections(charms),
    corrections,
    engine_version: typeof body.engine_version === 'string' ? body.engine_version.slice(0, 40) : '',
  };
}
