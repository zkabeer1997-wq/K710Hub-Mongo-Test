import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import crypto from 'node:crypto';

const state = { tables: {} };
globalThis.__revokeTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:revoke-mongo', shortCircuit: true };
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:revoke-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__revokeTest.tables);` };
    }
    return next(u, c);
  },
});

process.env.MEMBER_SESSION_SECRET = 'revocation-test-only';
const { createMemberToken, readMemberSession, invalidateMemberSessionCache } = await import('../lib/memberAuth.js');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const reqFor = (token) => ({ cookies: { get: (k) => (k === 'k710_member_session' && token ? { value: token } : undefined) } });

test('cookie with no session row (legacy) is still accepted', async () => {
  const token = await createMemberToken('1234567');
  assert.equal((await readMemberSession(reqFor(token)))?.memberId, '1234567');
});

test('a revoked session row invalidates the cookie everywhere', async () => {
  const token = await createMemberToken('7654321');
  state.tables.kingshot_sessions = [{ token_hash: hash(token), player_id: '7654321', expires_at: new Date(Date.now() + 1e6), revoked_at: null }];
  invalidateMemberSessionCache();
  assert.ok(await readMemberSession(reqFor(token)));
  state.tables.kingshot_sessions[0].revoked_at = new Date();
  // Cached for up to 30s unless logout clears it (revokeMemberSession does).
  assert.ok(await readMemberSession(reqFor(token)));
  invalidateMemberSessionCache(token);
  assert.equal(await readMemberSession(reqFor(token)), null);
});

test('an expired session row is rejected and tampered cookies never reach the store', async () => {
  const token = await createMemberToken('1111111');
  state.tables.kingshot_sessions.push({ token_hash: hash(token), player_id: '1111111', expires_at: new Date(Date.now() - 1000), revoked_at: null });
  invalidateMemberSessionCache();
  assert.equal(await readMemberSession(reqFor(token)), null);
  assert.equal(await readMemberSession(reqFor(token.slice(0, -2) + 'xx')), null);
  assert.equal(await readMemberSession(reqFor('')), null);
});
