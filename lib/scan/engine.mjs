import { getKind } from './kinds/index.mjs';
import { resizeToWidth } from './normalize.mjs';
import { STANDARD_WIDTH } from './imageCheck.mjs';
import { locateCharmRows } from './kinds/governorProfile/locate.mjs';
import { readGovernorGear } from './kinds/governorProfile/gear.mjs';
import { readGovernorCharms } from './kinds/governorProfile/charms.mjs';
import { validateGovernorProfileReading } from './kinds/governorProfile/validate.mjs';

/** Gem rows and tiles are found by size, not by fixed pixels, so very wide images are shrunk to keep reading fast. */
const MAX_READ_WIDTH = 1500;
const MIN_READ_WIDTH = 300;


export const ENGINE_VERSION = '0.2.0';

function scanGovernorProfile(pixels, base) {
  if (!pixels || !(pixels.width >= MIN_READ_WIDTH)) return { ...base, status: 'invalid_image', reasons: ['The image is too small to read. Use the full-size screenshot.'] };
  let px = pixels;
  try {
    if (pixels.width > MAX_READ_WIDTH) px = resizeToWidth(pixels, MAX_READ_WIDTH);
  } catch (e) {
    return { ...base, status: 'invalid_image', reasons: [e.message] };
  }
  const located = locateCharmRows(px);
  if (!located.rows.length) {
    return { ...base, status: 'failed', reasons: ['We could not find the gear pieces and charms. Open Governor Profile in the game, show the gear (not hidden), and take a new screenshot.'] };
  }
  const gear = readGovernorGear(px, located).map(validateGovernorProfileReading);
  const charms = readGovernorCharms(px, { located }).map(validateGovernorProfileReading);
  const reasons = located.missing.length ? [`Some rows were not found directly and were placed from the others: ${located.missing.join(', ')}.`] : [];
  return { ...base, status: 'ok', reasons, gear, charms };
}

/**
 * governor_profile: reads the six gear tiles and 18 charms, finding them in the image itself (no layout profile needed).
 * Other kinds are not built yet: they validate the profile, normalise the size and return 'not_implemented'.
 * @param {string} kind
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} pixels
 * @param {unknown} [profile] layout profile (only for kinds that still use one)
 * @param {{ standardWidth?: number }} [options]
 */
export function runScan(kind, pixels, profile, options = {}) {
  const base = { kind, engine_version: ENGINE_VERSION };
  if (kind === 'governor_profile') { getKind(kind); return scanGovernorProfile(pixels, base); }
  const { profileSchema } = getKind(kind);
  const parsed = profileSchema.safeParse(profile);
  if (!parsed.success) {
    return { ...base, status: 'invalid_profile', reasons: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  let normalized;
  try {
    normalized = resizeToWidth(pixels, options.standardWidth ?? STANDARD_WIDTH);
  } catch (e) {
    return { ...base, status: 'invalid_image', reasons: [e.message] };
  }
  return {
    ...base,
    status: 'not_implemented',
    profile_version: parsed.data.version,
    normalized_size: { width: normalized.width, height: normalized.height },
    reasons: ['readers arrive in phase 3'],
  };
}
