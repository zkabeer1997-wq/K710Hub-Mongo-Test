// npm run scan:charms:eval: how well does the charm reader do on the labelled Governor Profile screenshots?
// Each image is read WITHOUT the exemplars cut from that same image (leave-one-image-out), so the
// numbers are not flattered. Also reports the confident-and-wrong count, which must stay 0.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readGovernorCharms, CHARM_EXEMPLARS } from '../lib/scan/kinds/governorProfile/charms.mjs';

const dir = path.resolve(import.meta.dirname, '../tests/fixtures/scan/governor_profile');
const labelsPath = path.join(dir, 'labels.json');
if (!fs.existsSync(labelsPath)) { console.log('No governor_profile fixtures found.'); process.exit(0); }
const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
const exemplarJson = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../lib/scan/kinds/governorProfile/charmExemplars.json'), 'utf8'));
void CHARM_EXEMPLARS;

let n = 0; let right = 0; let confident = 0; let confidentRight = 0; const bad = [];
for (const [file, lab] of Object.entries(labels.images)) {
  const src = path.join(dir, file);
  if (!fs.existsSync(src) || !lab.charms) continue;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { decodeCharmExemplars } = await import('../lib/scan/readers/charmReader.mjs');
  const others = decodeCharmExemplars({ ...exemplarJson, items: exemplarJson.items.filter((i) => i.source !== file) });
  const read = readGovernorCharms({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) }, { exemplars: others });
  for (const { slot, level } of read) {
    const truth = lab.charms[slot];
    if (truth == null) continue;
    n += 1;
    const ok = level.value === truth;
    if (ok) right += 1;
    if (level.confidence >= 0.8) { confident += 1; if (ok) confidentRight += 1; }
    if (!ok) bad.push(`${file} ${slot}: expected ${truth}, read ${level.value} (confidence ${level.confidence})`);
  }
}
console.log(`charm reader, leave-one-image-out: ${right}/${n} correct (${((100 * right) / Math.max(1, n)).toFixed(1)}%)`);
console.log(`confident (>= 0.8): ${confident}, of which correct ${confidentRight}; confident AND wrong: ${confident - confidentRight}`);
for (const b of bad) console.log(`  miss: ${b}`);
process.exitCode = confident - confidentRight > 0 ? 1 : 0;
