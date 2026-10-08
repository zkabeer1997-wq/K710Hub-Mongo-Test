// npm run scan:eval: scan labelled fixtures in tests/fixtures/scan/<kind>/ and report accuracy.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureLabels } from '../lib/scan/schemas.mjs';
import { KINDS } from '../lib/scan/kinds/index.mjs';
import { runScan, ENGINE_VERSION } from '../lib/scan/engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = join(root, 'tests', 'fixtures', 'scan');
const NONE = 'No labelled fixtures found: add images + labels.json (see docs/scan-engine-plan.md)';

function discover() {
  const found = [];
  if (!existsSync(fixturesRoot)) return found;
  for (const kind of Object.keys(KINDS)) {
    const dir = join(fixturesRoot, kind);
    const labelsPath = join(dir, 'labels.json');
    if (existsSync(dir) && statSync(dir).isDirectory() && existsSync(labelsPath)) found.push({ kind, dir, labelsPath });
  }
  return found;
}

/** Flatten expected labels into { "hat.quality": "gold", ... } for comparison. */
function flatten(labels) {
  const out = {};
  for (const [slot, g] of Object.entries(labels.gear ?? {})) {
    out[`${slot}.quality`] = g.quality; out[`${slot}.tier`] = g.tier; out[`${slot}.stars`] = g.stars;
  }
  for (const [slot, level] of Object.entries(labels.charms ?? {})) out[`charm.${slot}.level`] = level;
  (labels.heroGear ?? []).forEach((p, i) => {
    out[`hero.${i}.troop`] = p.troop; out[`hero.${i}.level`] = p.level; out[`hero.${i}.forgery`] = p.forgery;
  });
  return out;
}

function flattenResult(result) {
  const out = {};
  for (const g of result.gear ?? []) { out[`${g.slot}.quality`] = g.quality.value; out[`${g.slot}.tier`] = g.tier.value; out[`${g.slot}.stars`] = g.stars.value; }
  for (const c of result.charms ?? []) out[`charm.${c.slot}.level`] = c.level.value;
  (result.heroGear ?? []).forEach((p, i) => { out[`hero.${i}.troop`] = p.troop.value; out[`hero.${i}.level`] = p.level.value; out[`hero.${i}.forgery`] = p.forgery.value; });
  return out;
}

async function loadPixels(file) {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

async function main() {
  const sets = discover();
  if (sets.length === 0) {
    console.log(NONE);
    return 0;
  }
  console.log(`scan:eval (engine ${ENGINE_VERSION})`);
  const perField = new Map();
  const failures = [];
  let total = 0; let correct = 0; let notImplemented = 0; let invalid = 0;
  for (const { kind, dir, labelsPath } of sets) {
    const parsed = FixtureLabels.safeParse(JSON.parse(readFileSync(labelsPath, 'utf8')));
    if (!parsed.success || parsed.data.kind !== kind) {
      console.log(`${kind}: labels.json is invalid: ${parsed.success ? 'kind mismatch' : parsed.error.issues[0].message}`);
      invalid += 1;
      continue;
    }
    const profilePath = join(dir, 'profile.json');
    const profile = existsSync(profilePath) ? JSON.parse(readFileSync(profilePath, 'utf8')) : null;
    for (const [file, labels] of Object.entries(parsed.data.images)) {
      const imagePath = join(dir, file);
      if (!existsSync(imagePath)) { failures.push(`${kind}/${file}: image file missing`); invalid += 1; continue; }
      const result = runScan(kind, await loadPixels(imagePath), profile);
      if (result.status === 'not_implemented') { console.log(`${kind}/${file}: engine not implemented`); notImplemented += 1; continue; }
      if (result.status !== 'ok') { failures.push(`${kind}/${file}: ${result.status} ${result.reasons.join('; ')}`); continue; }
      const expected = flatten(labels); const actual = flattenResult(result);
      for (const [key, want] of Object.entries(expected)) {
        const field = key.split('.').pop();
        const stat = perField.get(field) ?? { ok: 0, n: 0 };
        stat.n += 1; total += 1;
        if (actual[key] === want) { stat.ok += 1; correct += 1; } else failures.push(`${kind}/${file} ${key}: expected ${want}, got ${actual[key]}`);
        perField.set(field, stat);
      }
    }
  }
  if (perField.size > 0) {
    for (const [field, s] of perField) console.log(`  ${field}: ${((100 * s.ok) / s.n).toFixed(1)}% (${s.ok}/${s.n})`);
    console.log(`overall: ${((100 * correct) / total).toFixed(1)}% (${correct}/${total})`);
  } else {
    console.log(`No accuracy to report (${notImplemented} fixture(s) skipped: engine not implemented).`);
  }
  if (failures.length > 0) { console.log('failures:'); for (const f of failures) console.log(`  ${f}`); }
  return invalid > 0 ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
