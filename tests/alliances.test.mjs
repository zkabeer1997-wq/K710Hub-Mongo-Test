import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import {
  discordLinkLabel, discordUrl, leaderView, normalizeDiscordId, parseLegacyR5, planLeaderMigration,
  resolveLeaders, sortLeaders, validateLeaders, MAX_LEADERS,
} from '../lib/allianceLeaders.mjs';
import { FALLBACK_HUES, bandHue, bandProps, orderAlliancesForLanding } from '../lib/alliances.mjs';
import { acceptedAllianceTags, migrateOptionsFor, offeredAllianceTags, withCurrentTag } from '../lib/allianceTags.mjs';
import { isLocalMongoUri } from '../lib/localMongo.mjs';

const state = { tables: { alliances: [] }, paths: [] };
globalThis.__allianceLeadersTest = state;
registerHooks({
  resolve(specifier, context, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(specifier)) return { url: 'test:al-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:al-cache', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (/\/(adminAuth|memberAuth|bearHuntSchedule|publicBearSchedule|publicAllianceEvents|revalidateAlliancePages|mongoCollections|ics)$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:al-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          import { createFakeMongo } from ${JSON.stringify(helperUrl)};
          const base = createFakeMongo(globalThis.__allianceLeadersTest.tables, { alliances: ['tag'] });
          export const getCollection = base.getCollection;
          export const ensureIndexes = base.ensureIndexes;
        `,
      };
    }
    if (url === 'test:al-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = path => globalThis.__allianceLeadersTest.paths.push(path);' };
    return next(url, context);
  },
});
const { POST } = await import('../app/api/admin-alliances/route.js');
const { PUT } = await import('../app/api/admin-alliances/[tag]/route.js');
process.env.ADMIN_PASSWORD = 'alliance-leaders-test-only';
const token = await mintAdminToken();
const request = (body) => ({ cookies: { get: () => ({ value: token }) }, json: async () => body });
const putParams = (tag) => ({ params: Promise.resolve({ tag }) });

const ID = '123456789012345678';

test('Discord ids: numeric id or pasted profile URL normalise to the id; anything else is rejected', () => {
  assert.equal(normalizeDiscordId(ID), ID);
  assert.equal(normalizeDiscordId(` ${ID} `), ID);
  assert.equal(normalizeDiscordId(`https://discord.com/users/${ID}`), ID);
  assert.equal(normalizeDiscordId(`https://www.discord.com/users/${ID}/`), ID);
  assert.equal(normalizeDiscordId(''), '');
  assert.equal(normalizeDiscordId(null), '');
  for (const bad of ['12345', '1234567890123456', '123456789012345678901', 'yumin#1234', '@yumin', `https://evil.example/users/${ID}`, `https://discord.com/channels/${ID}`, `javascript:${ID}`, `${ID}abc`]) {
    assert.equal(normalizeDiscordId(bad), null, bad);
  }
});

test('the Discord link exists only for a valid stored id and is never built from a username', () => {
  assert.equal(discordUrl(ID), `https://discord.com/users/${ID}`);
  for (const none of [undefined, null, '', 'yumin', '@yumin', '123']) assert.equal(discordUrl(none), null);
  const withId = leaderView({ id: 'a', role: 'R5', name: 'Yumin', discord_id: ID });
  assert.equal(withId.href, `https://discord.com/users/${ID}`);
  assert.equal(withId.linkLabel, 'Message Yumin on Discord');
  assert.equal(discordLinkLabel('Yumin'), 'Message Yumin on Discord');
  const without = leaderView({ id: 'b', role: 'R5', name: 'Woff' });
  assert.equal(without.href, null);
  assert.equal(without.linkLabel, null);
  // A username-looking value in discord_id must never produce a link.
  assert.equal(leaderView({ id: 'c', role: 'R5', name: 'X', discord_id: 'woff#0001' }).href, null);
});

test('leaders validation: cleans rows, keeps ids, normalises Discord, enforces limits', () => {
  const ok = validateLeaders([
    { id: 'keep-1', role: ' R5 ', name: '  Yumin  ', player_id: '12345678', discord_id: `https://discord.com/users/${ID}` },
    { role: 'Transfer Manager', name: 'Asri' },
    { role: 'Scribe', name: 'Mira', discord_id: '' },
  ]);
  assert.equal(ok.error, undefined);
  assert.equal(ok.leaders.length, 3);
  assert.deepEqual(ok.leaders[0], { id: 'keep-1', role: 'R5', name: 'Yumin', player_id: '12345678', discord_id: ID });
  assert.ok(ok.leaders[1].id && ok.leaders[1].id !== ok.leaders[2].id);
  assert.equal('discord_id' in ok.leaders[1], false);
  assert.deepEqual(validateLeaders(undefined), { leaders: [] });
  assert.deepEqual(validateLeaders([]), { leaders: [] });

  const bad = [
    'nope', [null], [{ role: '', name: 'A' }], [{ role: 'R5', name: '' }], [{ role: 'R5', name: 'x'.repeat(61) }],
    [{ role: 'x'.repeat(31), name: 'A' }], [{ role: '<b>R5</b>', name: 'A' }], [{ role: 'R5', name: 'A', discord_id: 'woff#1' }],
    [{ role: 'R5', name: 'A', player_id: 'abc' }], [{ role: 'R5', name: 'A\u0000B' }],
    Array.from({ length: MAX_LEADERS + 1 }, (_, i) => ({ role: 'R4', name: `P${i}` })),
  ];
  for (const input of bad) assert.ok(validateLeaders(input).error, JSON.stringify(input).slice(0, 60));
  // duplicate ids are replaced, never trusted
  const dup = validateLeaders([{ id: 'same', role: 'R5', name: 'A' }, { id: 'same', role: 'R4', name: 'B' }]).leaders;
  assert.notEqual(dup[0].id, dup[1].id);
});

test('read-time fallback: legacy Home text supplies R5 until `leaders` exists, then leaders win', () => {
  const home = { wb_1_desc: 'Two Bear Hunts each day.\n\nR5: Yumin', wb_2_desc: 'Three.\n\nR5: Woff', wb_3_desc: 'no leader line' };
  assert.equal(parseLegacyR5(home.wb_1_desc), 'Yumin');
  assert.equal(parseLegacyR5('nothing'), '');
  assert.deepEqual(resolveLeaders({ tag: '710' }, home).map((l) => [l.role, l.name]), [['R5', 'Yumin']]);
  assert.equal(resolveLeaders({ tag: 'red' }, home)[0].name, 'Woff');
  assert.deepEqual(resolveLeaders({ tag: 'SKY' }, home), []);
  assert.deepEqual(resolveLeaders({ tag: 'PHL' }, home), []);
  // stored list wins, even over the legacy text, and an empty stored list means "no leaders"
  const stored = { tag: '710', leaders: [{ id: '1', role: 'R4', name: 'Bo' }, { id: '2', role: 'R5', name: 'Cy', discord_id: ID, player_id: '999' }] };
  const out = resolveLeaders(stored, home);
  assert.deepEqual(out.map((l) => l.name), ['Cy', 'Bo']); // R5 first
  assert.equal(out[0].discord_id, ID);
  assert.equal('player_id' in out[0], false); // never public
  assert.deepEqual(resolveLeaders({ tag: '710', leaders: [] }, home), []);
  // an invalid stored discord id is dropped rather than linked
  assert.equal('discord_id' in resolveLeaders({ tag: 'X', leaders: [{ id: '1', role: 'R5', name: 'A', discord_id: 'a#1' }] })[0], false);
  assert.deepEqual(sortLeaders([{ role: 'Scribe' }, { role: 'Transfer Manager' }, { role: 'R4' }, { role: 'R5' }]).map((l) => l.role), ['R5', 'R4', 'Transfer Manager', 'Scribe']);
});

test('migration plan: only alliances without leaders, and re-running changes nothing', () => {
  const home = { wb_1_desc: 'x\n\nR5: Yumin', wb_2_desc: 'x\n\nR5: Woff', wb_3_desc: 'x' };
  const alliances = [{ tag: '710' }, { tag: 'RED', leaders: [] }, { tag: 'SKY' }, { tag: 'PHL' }];
  const plan = planLeaderMigration(alliances, home);
  assert.deepEqual(plan.map((p) => p.tag), ['710']);
  assert.equal(plan[0].leaders[0].role, 'R5');
  assert.equal(plan[0].leaders[0].name, 'Yumin');
  const after = alliances.map((a) => (plan.find((p) => p.tag === a.tag) ? { ...a, leaders: plan.find((p) => p.tag === a.tag).leaders } : a));
  assert.deepEqual(planLeaderMigration(after, home), []);
});

test('migration script refuses non-local databases', () => {
  assert.equal(isLocalMongoUri('mongodb://127.0.0.1:27017'), true);
  assert.equal(isLocalMongoUri('mongodb://localhost:27017/k710hub_test'), true);
  assert.equal(isLocalMongoUri('mongodb://user:pw@localhost/db'), true);
  assert.equal(isLocalMongoUri('mongodb+srv://u:p@cluster0.example.mongodb.net/db'), false);
  assert.equal(isLocalMongoUri('mongodb://u:p@cluster0-shard-00-00.example.mongodb.net:27017/db'), false);
  assert.equal(isLocalMongoUri('mongodb://localhost,evil.example:27017'), false);
  assert.equal(isLocalMongoUri(''), false);
});

test('landing order: 710, RED, SKY, PHL first; others follow by sort_order; nothing invented', () => {
  const mk = (tag, sort_order = 0) => ({ tag, sort_order });
  const tags = (list) => orderAlliancesForLanding(list).map((a) => a.tag);
  assert.deepEqual(tags([mk('PHL', 9), mk('SKY', 1), mk('710', 5), mk('RED', 2)]), ['710', 'RED', 'SKY', 'PHL']);
  assert.deepEqual(tags([mk('SKY', 1), mk('710', 5), mk('RED', 2)]), ['710', 'RED', 'SKY']); // PHL absent: no placeholder
  assert.deepEqual(tags([mk('ZED', 2), mk('PHL', 7), mk('ABC', 1), mk('SKY'), mk('710'), mk('RED')]), ['710', 'RED', 'SKY', 'PHL', 'ABC', 'ZED']);
  assert.deepEqual(tags([mk('B', 1), mk('A', 1)]), ['A', 'B']); // tie broken by tag
  assert.deepEqual(tags([]), []);
  assert.deepEqual(tags(null), []);
  assert.deepEqual(tags([mk('phl'), mk('710')]), ['710', 'phl']); // lower case still recognised
});

test('band colours: named four use their own tokens, every other tag gets a stable fallback hue', () => {
  for (const tag of ['710', 'RED', 'SKY', 'PHL', 'phl']) assert.equal(bandHue(tag), '', tag);
  for (const tag of ['ABC', 'ZED', 'X1', 'FOREVER', 'QQ']) {
    const hue = Number(bandHue(tag));
    assert.ok(hue >= 1 && hue <= FALLBACK_HUES, tag);
    assert.equal(bandHue(tag), bandHue(tag.toLowerCase()));
  }
  assert.deepEqual(bandProps('PHL'), { 'data-band': 'PHL' });
  assert.equal(bandProps('abc')['data-band'], 'ABC');
  assert.ok(bandProps('abc')['data-hue']);
  const hues = new Set(Array.from({ length: 40 }, (_, i) => bandHue(`T${i}`)));
  assert.ok(hues.size >= 3, 'the rotation spreads tags over several colours');
});

test('form alliance lists: offered = active tags (legacy three if none), accepted also keeps legacy values', () => {
  assert.deepEqual(offeredAllianceTags(['710', 'RED', 'SKY', 'PHL']), ['710', 'RED', 'SKY', 'PHL']);
  assert.deepEqual(offeredAllianceTags([]), ['710', 'RED', 'SKY']);
  assert.deepEqual(offeredAllianceTags(undefined), ['710', 'RED', 'SKY']);
  assert.deepEqual(offeredAllianceTags(['PHL', 'PHL', ' ']), ['PHL']);
  assert.deepEqual(acceptedAllianceTags(['PHL']), ['PHL', '710', 'RED', 'SKY']);
  assert.ok(acceptedAllianceTags(['710', 'PHL']).includes('RED'), 'saved answers for a retired alliance stay valid');
  assert.deepEqual(withCurrentTag(['710'], 'OLD'), ['710', 'OLD']);
  assert.deepEqual(withCurrentTag(['710'], '710'), ['710']);
  assert.deepEqual(withCurrentTag(['710'], ''), ['710']);
});

test('transfer form options keep the stored wording of the original three and add new alliances', () => {
  const legacy = migrateOptionsFor(null).map((o) => o.value);
  assert.deepEqual(legacy, ['710 (Bear 0200UTC and 1300UTC)', 'RED (Bear 1105UTC, 1900UTC and 2320UTC)', 'SKY (Bear 1200UTC and 2000UTC)', 'Other']);
  const withPhl = migrateOptionsFor([{ tag: '710', bear_times_utc: ['02:00', '13:00'] }, { tag: 'PHL', bear_times_utc: ['04:30', '16:30'] }, { tag: 'NEW', bear_times_utc: [] }]);
  assert.equal(withPhl[0].value, '710 (Bear 0200UTC and 1300UTC)');
  assert.equal(withPhl[1].value, 'PHL (Bear 0430UTC and 1630UTC)');
  assert.equal(withPhl[1].hint, 'Bear Hunt at 04:30 and 16:30 UTC');
  assert.equal(withPhl[2].value, 'NEW');
  assert.equal(withPhl.at(-1).value, 'Other');
});

test('admin API: leaders are validated and stored on create and update; bad input changes nothing', async () => {
  const created = await POST(request({ tag: 'PHL', name: 'PHL', leaders: [{ role: 'R5', name: 'Mira', discord_id: `https://discord.com/users/${ID}` }] }));
  assert.equal(created.status, 200);
  const stored = state.tables.alliances.find((a) => a.tag === 'PHL');
  assert.equal(stored.leaders[0].discord_id, ID);
  assert.ok(stored.leaders[0].id);

  const before = JSON.stringify(state.tables.alliances);
  for (const leaders of ['x', [{ role: 'R5', name: 'A', discord_id: 'a#1' }], [{ role: '', name: 'A' }], Array.from({ length: 13 }, () => ({ role: 'R4', name: 'A' }))]) {
    assert.equal((await PUT(request({ leaders }), putParams('PHL'))).status, 400);
    assert.equal((await POST(request({ tag: 'BAD', name: 'Bad', leaders }))).status, 400);
  }
  assert.equal(JSON.stringify(state.tables.alliances), before);

  const updated = await PUT(request({ leaders: [{ id: stored.leaders[0].id, role: 'R5', name: 'Mira' }, { role: 'Transfer Manager', name: 'Jo', discord_id: ID }] }), putParams('PHL'));
  assert.equal(updated.status, 200);
  const after = state.tables.alliances.find((a) => a.tag === 'PHL');
  assert.equal(after.leaders.length, 2);
  assert.equal('discord_id' in after.leaders[0], false); // removing the id removes the link
  assert.equal(after.leaders[1].discord_id, ID);

  // an update that does not mention leaders leaves them alone
  await PUT(request({ language: 'English' }), putParams('PHL'));
  assert.equal(state.tables.alliances.find((a) => a.tag === 'PHL').leaders.length, 2);
});
