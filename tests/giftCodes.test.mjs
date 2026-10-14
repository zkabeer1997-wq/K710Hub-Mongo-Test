import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGiftCodeStatusByMember, mergeGiftCodeStatusIntoRows } from '../lib/giftCodes.mjs';
import { giftCodeHealth, giftRedeemPhrase } from '../lib/adminOverview.mjs';

const players = [
  { player_id: '106599852', member_id: '106599852', enabled: true, failed: false },
  { player_id: '222222', enabled: false, failed: false },
  { player_id: '333333', member_id: '333333', enabled: true, failed: true },
];
const redemptions = [
  { player_id: '106599852', code: 'NEWEST', status: 'success', updated_at: '2026-01-03T00:00:00Z' },
  { player_id: '106599852', code: 'OLDER', status: 'expired', updated_at: '2026-01-02T00:00:00Z' },
];
const activeCodes = [{ code: 'NEWEST' }, { code: 'OLDER' }, { code: 'FRESH' }];

describe('summarizeGiftCodeStatusByMember', () => {
  it('summarizes real redemption rows, newest first, and counts waiting codes', () => {
    const mine = summarizeGiftCodeStatusByMember(players, redemptions, activeCodes).get('106599852');
    assert.equal(mine.enrolled, true);
    assert.equal(mine.enabled, true);
    assert.equal(mine.redeemed, 1);
    assert.equal(mine.failed, 1);
    assert.equal(mine.pending, 1);
    assert.equal(mine.latestStatus, 'success');
    assert.equal(mine.latestCode, 'NEWEST');
  });
  it('keys admin-added players by player id and flags paused and failed ones', () => {
    const s = summarizeGiftCodeStatusByMember(players, [], activeCodes);
    assert.equal(s.get('222222').enabled, false);
    assert.equal(s.get('222222').pending, 0);
    assert.equal(s.get('333333').playerFailed, true);
    assert.equal(s.get('333333').pending, 0);
  });
});

describe('mergeGiftCodeStatusIntoRows', () => {
  it('attaches gift_code status and a not-enrolled default otherwise', () => {
    const rows = mergeGiftCodeStatusIntoRows(
      [{ member_id: '106599852' }, { member_id: 'NOBODY' }],
      summarizeGiftCodeStatusByMember(players, redemptions, activeCodes),
    );
    assert.equal(rows[0].gift_code.enrolled, true);
    assert.equal(rows[0].gift_code.latestCode, 'NEWEST');
    assert.equal(rows[1].gift_code.enrolled, false);
  });
});

describe('gift health line includes the auto-redeem state', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const sources = [{ enabled: true, last_checked_at: '2026-10-10T10:00:00Z', result: 'ok' }];
  const redeem = (runner, config = { secret_present: true }) => ({ runner, config });
  it('says what the switch is doing', () => {
    assert.match(giftCodeHealth(sources, now, redeem({ auto_redeem_enabled: false })).text, /auto-redeem off$/);
    assert.match(giftCodeHealth(sources, now, redeem({ auto_redeem_enabled: true, state: 'idle' })).text, /auto-redeem on$/);
    assert.match(giftCodeHealth(sources, now, redeem({ auto_redeem_enabled: true, state: 'running' })).text, /running$/);
    assert.match(giftCodeHealth(sources, now, redeem({ auto_redeem_enabled: true }, { secret_present: false })).text, /needs setup$/);
  });
  it('turns warn when the last run failed, and is unchanged without redeem info', () => {
    assert.equal(giftCodeHealth(sources, now, redeem({ auto_redeem_enabled: true, last_error: 'x' })).kind, 'warn');
    assert.equal(giftCodeHealth(sources, now).text, 'Gift codes: checked 2 h ago');
    assert.equal(giftRedeemPhrase(null), '');
  });
});
