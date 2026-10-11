import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkPowerNumber,
  displayPowerNumber,
  mergePowerProfilesIntoRows,
  powerNumberErrors,
  resolveMysticScore,
  sanitizePowerProfileInput,
} from '../lib/powerProfiles.mjs';

const base = { name: 'Ann', member_id: 'm1' };

test('Pet / Masters Power accept whole numbers (commas allowed) up to 100 million and store plain digits', () => {
  for (const [typed, digits] of [['1500000', '1500000'], ['1,500,000', '1500000'], ['0', '0'], ['100,000,000', '100000000']]) {
    const checked = checkPowerNumber('pet_power', typed);
    assert.equal(checked.ok, true, typed);
    assert.equal(checked.digits, digits, typed);
  }
  assert.deepEqual(checkPowerNumber('masters_power', '   '), { ok: true, empty: true, digits: '', error: '' });
});

test('Pet / Masters Power reject text, negatives, decimals without a suffix and absurd sizes with a clear message', () => {
  for (const typed of ['lots', '-5', '12.5', '1e9', '12abc', '1.5M', '450k', '2m']) {
    const checked = checkPowerNumber('pet_power', typed);
    assert.equal(checked.ok, false, typed);
    assert.match(checked.error, /^Pet Power: /, typed);
  }
  const big = checkPowerNumber('masters_power', '100,000,001');
  assert.equal(big.ok, false);
  assert.match(big.error, /Masters Power cannot be more than 100,000,000/);
  assert.equal(checkPowerNumber('masters_power', '100,000,000').ok, true);
  assert.equal(checkPowerNumber('pet_power', '9'.repeat(30)).ok, false);
});

test('powerNumberErrors lists every bad box by key', () => {
  assert.deepEqual(powerNumberErrors({ pet_power: '1,500,000', masters_power: '' }), []);
  const found = powerNumberErrors({ pet_power: 'abc', masters_power: 'x5b' });
  assert.deepEqual(found.map((e) => e.key), ['pet_power', 'masters_power']);
});

test('sanitizePowerProfileInput normalizes the numbers, names the bad field and ignores a typed Mystic Trial', () => {
  const ok = sanitizePowerProfileInput({ ...base, pet_power: '1,500,000', masters_power: ' 2,000,000 ', mystic_trial_score: '99999' });
  assert.equal(ok.pet_power, '1500000');
  assert.equal(ok.masters_power, '2000000');
  assert.equal(ok.mystic_trial_score, '', 'the member never types Mystic Trial');
  assert.equal(sanitizePowerProfileInput(base).pet_power, '');
  assert.throws(() => sanitizePowerProfileInput({ ...base, masters_power: 'many' }), (error) => error.field === 'masters_power' && /Masters Power/.test(error.message));
});

test('displayPowerNumber adds separators to valid numbers and leaves other text for the member to fix', () => {
  assert.equal(displayPowerNumber('1500000'), '1,500,000');
  assert.equal(displayPowerNumber('1.5M'), '1.5M', 'letters are left for the member to fix');
  assert.equal(displayPowerNumber(''), '');
  assert.equal(displayPowerNumber(null), '');
  assert.equal(displayPowerNumber('about two million'), 'about two million');
});

test('Mystic Trial precedence: the sign-in value always wins, a saved one is kept only when sign-in has none', () => {
  assert.deepEqual(resolveMysticScore({ login: 48250, saved: '1234' }), { value: '48250', source: 'login' });
  assert.deepEqual(resolveMysticScore({ login: '48250', saved: '' }), { value: '48250', source: 'login' });
  assert.deepEqual(resolveMysticScore({ login: 0, saved: '777' }), { value: '0', source: 'login' }, 'a real zero from the game is still the login value');
  assert.deepEqual(resolveMysticScore({ login: null, saved: '1234' }), { value: '1234', source: 'saved' });
  assert.deepEqual(resolveMysticScore({ login: undefined, saved: 1234 }), { value: '1234', source: 'saved' });
  assert.deepEqual(resolveMysticScore({ login: -3, saved: '9' }), { value: '9', source: 'saved' });
  assert.deepEqual(resolveMysticScore({ login: NaN, saved: null }), { value: '', source: 'none' });
  assert.deepEqual(resolveMysticScore(), { value: '', source: 'none' });
});

test('admin rows show the sign-in Mystic Trial over the stored one, and keep the stored one when there is none', () => {
  const rows = [{ member_id: 'a', name: 'A' }, { member_id: 'b', name: 'B' }, { member_id: 'c', name: 'C' }];
  const profiles = [{ member_id: 'a', mystic_trial_score: '1234' }, { member_id: 'b', mystic_trial_score: '555' }];
  const merged = mergePowerProfilesIntoRows(rows, profiles, new Map([['a', 48250]]));
  assert.equal(merged[0].mystic_trial_score, '48250');
  assert.equal(merged[1].mystic_trial_score, '555');
  assert.ok(!merged[2].mystic_trial_score);
  assert.equal(mergePowerProfilesIntoRows(rows, profiles)[0].mystic_trial_score, '1234', 'no sign-in map: unchanged behaviour');
});
