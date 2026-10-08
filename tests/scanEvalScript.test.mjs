import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('scan:eval with no fixtures prints a clear notice and exits 0', (t) => {
  const dirs = readdirSync(join(root, 'tests/fixtures/scan'));
  if (dirs.some((d) => d !== 'README.md')) { t.skip('fixtures now exist'); return; }
  const r = spawnSync(process.execPath, ['scripts/scan-eval.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No labelled fixtures found: add images \+ labels\.json \(see docs\/scan-engine-plan\.md\)/);
});
