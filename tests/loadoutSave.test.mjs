import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createMemberToken } from '../lib/memberAuth.js';
import { sanitizeLoadoutSave } from '../lib/loadoutSave.mjs';

const state = { tables: {} };
globalThis.__lsTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:ls-mongo', shortCircuit: true };
    if (s === 'next/server' || s === 'next/navigation') return next(s + '.js', c);
    if (/\/(memberAuth|mongoCollections)$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:ls-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__lsTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'ls-test-only';
const route = await import('../app/api/power-profile/loadout/route.js');
const { COLLECTIONS } = await import('../lib/mongoCollections.js');
const tokens = { a: await createMemberToken('member-a'), b: await createMemberToken('member-b') };
const cookies = (who) => ({ get: (k) => (who && k === 'k710_member_session' ? { value: tokens[who] } : undefined) });
const post = (body, who = 'a') => ({ cookies: cookies(who), json: async () => body });
const H = 3600e3;
const openGate = () => { state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'lead', is_open: true, opens_at: new Date(Date.now() - H), closes_at: new Date(Date.now() + H), cycle_id: 'c1' }]; };

// canonical order = the form's slot order
const GEAR = 'Infantry 1: Red T1 ★★ | Cavalry 1: Gold T3 ★';
const CHARMS = 'Infantry Charm 1: Level 13 | Cavalry Charm 1: Level 5';

test('sanitize: keeps valid values, rejects unknown ones, drops bad corrections', () => {
  const ok = sanitizeLoadoutSave({
    governor_gear: GEAR, charms: CHARMS, engine_version: '0.2.0',
    corrections: [
      { slot: 'hat', field: 'tier', read_value: 2, read_confidence: 0.7, corrected_value: 3 },
      { slot: '', field: 'x' },
    ],
  });
  assert.equal(ok.governor_gear, GEAR);
  assert.equal(ok.charms, CHARMS);
  assert.equal(ok.corrections.length, 1);
  assert.throws(() => sanitizeLoadoutSave({ governor_gear: 'Cavalry 1: Mythic T9', charms: '' }), /not a valid gear value/);
  assert.throws(() => sanitizeLoadoutSave({ governor_gear: '', charms: 'Cavalry Charm 1: Level 99' }), /not a valid charm level/);
  assert.throws(() => sanitizeLoadoutSave(null), /Invalid request/);
});

test('route: signed-in only, honours the form gate', async () => {
  openGate();
  assert.equal((await route.POST(post({ governor_gear: GEAR, charms: CHARMS }, null))).status, 401);
  state.tables[COLLECTIONS.FORM_GATES] = [{ form_key: 'lead', is_open: false }];
  assert.equal((await route.POST(post({ governor_gear: GEAR, charms: CHARMS }))).status, 403);
  assert.equal(state.tables[COLLECTIONS.POWER_PROFILES]?.length || 0, 0);
});

test('route: saves gear and charms into the member profile and keeps the other fields', async () => {
  openGate();
  state.tables[COLLECTIONS.POWER_PROFILES] = [{ member_id: 'member-a', name: 'Aria', pet_power: '123', governor_gear: 'old', charms: 'old' }];
  const res = await route.POST(post({
    governor_gear: GEAR, charms: CHARMS, engine_version: '0.2.0',
    corrections: [{ slot: 'hat', field: 'tier', read_value: 2, read_confidence: 0.7, corrected_value: 3 }],
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'updated');
  assert.equal(body.corrections_saved, 1);
  const row = state.tables[COLLECTIONS.POWER_PROFILES].find((r) => r.member_id === 'member-a');
  assert.equal(row.governor_gear, GEAR);
  assert.equal(row.charms, CHARMS);
  assert.equal(row.pet_power, '123');
  assert.equal(row.name, 'Aria');
  const corr = state.tables[COLLECTIONS.SCAN_CORRECTIONS];
  assert.equal(corr.length, 1);
  assert.equal(corr[0].member_id, 'member-a');
  assert.equal(corr[0].corrected_value, 3);
  assert.ok(!('image' in corr[0]));
});

test('route: a member can only ever write their own profile', async () => {
  openGate();
  state.tables[COLLECTIONS.POWER_PROFILES] = [{ member_id: 'member-a', name: 'Aria', governor_gear: 'A-gear', charms: 'A-charms' }];
  const res = await route.POST(post({ member_id: 'member-a', governor_gear: GEAR, charms: CHARMS }, 'b'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'created');
  const rows = state.tables[COLLECTIONS.POWER_PROFILES];
  assert.equal(rows.find((r) => r.member_id === 'member-a').governor_gear, 'A-gear');
  assert.equal(rows.find((r) => r.member_id === 'member-b').governor_gear, GEAR);
});

test('route: invalid values are 400 and nothing is stored', async () => {
  openGate();
  state.tables[COLLECTIONS.POWER_PROFILES] = [];
  state.tables[COLLECTIONS.SCAN_CORRECTIONS] = [];
  const res = await route.POST(post({ governor_gear: 'Cavalry 1: Platinum', charms: '' }));
  assert.equal(res.status, 400);
  assert.equal(state.tables[COLLECTIONS.POWER_PROFILES].length, 0);
});
