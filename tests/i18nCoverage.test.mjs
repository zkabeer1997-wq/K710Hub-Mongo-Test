import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The translation manifest (public/ui-strings.json) is generated from source by
// scripts/extract-ui-strings.js. Only strings in the manifest are translated, so
// this guards that member-form / dashboard / appointment copy from Phases 2-8
// (including strings that live in lib/*.mjs) is picked up.
const out = join(mkdtempSync(join(tmpdir(), 'k710-ui-')), 'ui-strings.json');
execFileSync(process.execPath, ['scripts/extract-ui-strings.js'], { env: { ...process.env, UI_STRINGS_OUT: out }, stdio: 'pipe' });
const strings = new Set(JSON.parse(readFileSync(out, 'utf8')));

test('manifest covers member forms, dashboard and appointment strings', () => {
  for (const text of [
    'Needs your input', 'Get started', 'Your vote', 'Submit my vote', 'Current power', // Phase 8 events + dashboard
    'You can change your answers and save again.',                                     // upsert notice
    'Apply', 'My Appointments', 'View Schedule', 'Update my application',            // appointments UI
    'Not applied', 'Pending', 'Assigned',                                            // lib/kvkAppointments.mjs status labels
    'Legion time', 'Flexible', 'Absent',                                             // lib/eventForms.mjs (.mjs source)
    'Change language', 'Choose your language',                                       // language switcher / chooser
  ]) {
    assert.ok(strings.has(text), `missing from translation manifest: ${text}`);
  }
});
