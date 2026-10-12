// Validation for saving a reviewed Governor Gear + Charms loadout straight into the member's power profile
// (POST /api/power-profile/loadout). Pure: no Mongo, no Next. The image of a scan is never part of this.
import { cleanCharmString, cleanGovernorGearString } from './powerProfiles.mjs';
import { ScanCorrection } from './scan/schemas.mjs';

export const MAX_CORRECTIONS = 60;

/**
 * @param {unknown} body { governor_gear: string, charms: string, corrections?: ScanCorrection[], engine_version?: string }
 * @returns {{ governor_gear: string, charms: string, corrections: object[], engine_version: string }}
 * @throws {Error} with a message that is safe to show to the member
 */
export function sanitizeLoadoutSave(body) {
  if (!body || typeof body !== 'object') throw new Error('Invalid request.');
  const governorGear = cleanGovernorGearString(body.governor_gear);
  const charms = cleanCharmString(body.charms);
  const corrections = [];
  for (const raw of Array.isArray(body.corrections) ? body.corrections.slice(0, MAX_CORRECTIONS) : []) {
    const parsed = ScanCorrection.safeParse(raw);
    if (parsed.success) corrections.push(parsed.data);
  }
  return {
    governor_gear: governorGear,
    charms,
    corrections,
    engine_version: typeof body.engine_version === 'string' ? body.engine_version.slice(0, 40) : '',
  };
}
