import { getKind } from './kinds/index.mjs';
import { resizeToWidth } from './normalize.mjs';
import { STANDARD_WIDTH } from './imageCheck.mjs';

export const ENGINE_VERSION = '0.1.0-phase1';

/**
 * Phase 1 skeleton: validates the profile, normalises the image size, and reports that readers are not
 * built yet. It deliberately returns NO readings.
 * @param {string} kind
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} pixels
 * @param {unknown} profile
 * @param {{ standardWidth?: number }} [options]
 */
export function runScan(kind, pixels, profile, options = {}) {
  const base = { kind, engine_version: ENGINE_VERSION };
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
