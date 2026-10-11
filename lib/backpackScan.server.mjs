// Server-side check of scan corrections (what the reader said vs what the member chose; never the image).
import { ScanCorrection } from './scan/schemas.mjs';
import { MAX_SCAN_CORRECTIONS } from './backpackScan.mjs';

/** Bad entries are dropped; at most MAX_SCAN_CORRECTIONS are kept. */
export function sanitizeScanCorrections(input) {
  const out = [];
  for (const raw of Array.isArray(input) ? input.slice(0, MAX_SCAN_CORRECTIONS) : []) {
    const parsed = ScanCorrection.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
